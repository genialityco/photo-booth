"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import ScreenSaverSlideshow from "@/app/components/common/ScreenSaverSlideshow";

/** Botón oculto: cuánto hay que mantener presionado el logo del evento para
 * forzar el salvapantallas sin esperar la inactividad. Es un "press and hold"
 * y no un tap simple a propósito — el logo está en pantallas donde el
 * asistente toca todo el tiempo, y un tap suelto abriría el salvapantallas en
 * plena sesión. Poner esto en 0 lo convertiría en un tap normal. */
const TRIGGER_HOLD_MS = 1200;

/** Cuánto puede moverse el dedo durante el hold antes de cancelarlo (px):
 * distingue "mantener presionado" de un arrastre o un roce al pasar. */
const TRIGGER_MOVE_TOLERANCE_PX = 16;

/** Ventana en la que se ignora la actividad del usuario después de una
 * activación manual. Sin esto, el `pointerup`/`click` que cierra el propio
 * gesto de hold contaría como actividad y cerraría el salvapantallas en el
 * mismo movimiento con el que se abrió. */
const MANUAL_ACTIVATION_GRACE_MS = 900;

/** Resuelve un src a URL absoluta, que es como el navegador deja `img.src` /
 * `img.currentSrc`. Necesario para poder comparar el logo configurado en el
 * evento (que puede venir como ruta relativa, ej. `/images/logo.png`) con el
 * `<img>` que recibió el toque. */
function toAbsoluteUrl(src: string): string {
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

/**
 * Shell del salvapantallas: detecta inactividad y muestra el overlay a
 * pantalla completa (con animación de entrada/salida) cuando corresponde. El
 * contenido en sí (loop de media → splash → galería → filtros) lo arma
 * ScreenSaverSlideshow — ver ese componente para el detalle de cada slide.
 */
const NOOP = () => {};

export default function ScreenSaver({
  event,
  activityKey,
  onActiveChange,
  mirrorActive,
}: {
  event: EventProfile;
  /** Cambia con cada paso relevante del flujo (splash/landing/wizard y, ya
   * dentro del wizard, cada paso interno: capture/preview/.../result).
   * Cada cambio cuenta como actividad y reinicia el timer, igual que un
   * toque real — necesario porque durante la generación de IA y el
   * revelado el usuario puede pasar bastante tiempo sin tocar la pantalla
   * (esperando) y aun así seguir "activo" viendo el flujo, no inactivo. Sin
   * esto el salvapantalla podía saltar a los pocos segundos de llegar al
   * resultado, porque el reloj de inactividad seguía corriendo desde el
   * último toque real (ej. confirmar el preview), bastante antes. */
  activityKey?: string;
  /** Se llama cada vez que este salvapantallas se abre o se cierra. La página
   * del booth lo usa para transmitirlo por la sesión en vivo, de modo que la
   * pantalla espejo entre y salga junto con la tablet. */
  onActiveChange?: (active: boolean) => void;
  /**
   * Modo espejo. `undefined` = este tab decide solo (tablet líder o evento
   * sin pantalla espejo): reloj de inactividad + botón oculto propios. Con un
   * booleano, el componente queda PASIVO: no escucha actividad ni gestos, y
   * solo refleja lo que el líder transmite — la pantalla espejo no tiene
   * actividad propia que medir, y si corriera su propio reloj las dos
   * pantallas se desincronizarían.
   */
  mirrorActive?: boolean;
}) {
  const isMirror = mirrorActive !== undefined;
  const timeoutMs = (event.screenSaverInactivityTimeoutSec ?? 150) * 1000;

  // Candidatos sincrónicos, derivados solo de `event` — alcanza para decidir
  // si vale la pena activar el overlay. La elegibilidad real de la galería
  // (que depende de una suscripción en vivo a Firestore) se resuelve dentro
  // de ScreenSaverSlideshow; acá su toggle solo cuenta como candidato
  // optimista, sin esperar a saber si ya hay fotos.
  const hasMedia =
    !!(event.screenSaverVideoUrl || event.splashImage) &&
    event.screenSaverMediaSlideEnabled !== false;
  const hasSplash = event.screenSaverSplashSlideEnabled !== false;
  const hasGalleryCandidate = event.screenSaverGallerySlideEnabled !== false;
  const hasFilters =
    (event.prompts?.length ?? 0) >= 2 && event.screenSaverFiltersSlideEnabled !== false;
  // Mismo criterio optimista que la galería: si el evento la activó, cuenta
  // como candidata acá aunque todavía no se sepa si hay fotos (eso lo resuelve
  // ScreenSaverSlideshow). Sin esto, un evento con SOLO esta pantalla activada
  // nunca llegaría a mostrar el salvapantallas.
  const hasFolderCandidate = event.screenSaverFolderSlideEnabled === true;
  const hasAnySlideCandidate =
    hasMedia || hasSplash || hasGalleryCandidate || hasFilters || hasFolderCandidate;

  /** Logo que hace de botón oculto: el inferior si el evento lo tiene y, si
   * no, el superior. Se compara por src (no por un handler puesto en cada
   * pantalla) porque el mismo logo lo dibujan media docena de componentes
   * distintos — splash, landing, header/footer del wizard, capture, loader,
   * customize — y así el gesto funciona en todos sin duplicar cableado, y
   * también en las pantallas que se agreguen después. */
  const triggerLogoSrc = event.logoBottom || event.logoTop || null;

  const [isActive, setIsActive] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  /** Timestamp hasta el que la actividad del usuario no cuenta — ver
   * MANUAL_ACTIVATION_GRACE_MS. */
  const suppressActivityUntilRef = useRef(0);
  /** Timer de la animación de salida, cancelable: si el salvapantallas se
   * vuelve a abrir dentro de esos 500ms (posible en espejo, donde el estado
   * llega de afuera), el cierre pendiente no debe pisarlo. */
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Ref en vez de depender del estado `isActive`: así `resetIdleTimer` no
  // necesita recrearse (ni el efecto de listeners DOM reengancharse) cada vez
  // que el salvapantalla entra/sale.
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleActivity = useCallback(() => {
    if (Date.now() < suppressActivityUntilRef.current) return;
    if (isActiveRef.current) {
      // Iniciar animación de salida
      setIsExiting(true);
      // Después de la animación, ocultar completamente
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => {
        exitTimerRef.current = undefined;
        isActiveRef.current = false;
        setIsActive(false);
        setIsExiting(false);
      }, 500); // Duración de la animación
    }
  }, []);

  // Reinicia el reloj de inactividad — usado tanto por los listeners DOM
  // reales como por los cambios de `activityKey` (actividad "programática").
  const resetIdleTimer = useCallback(() => {
    if (Date.now() < suppressActivityUntilRef.current) return;
    clearTimeout(timeoutRef.current);
    if (isActiveRef.current) handleActivity();
    timeoutRef.current = setTimeout(() => setIsActive(true), timeoutMs);
  }, [timeoutMs, handleActivity]);

  /** Activación manual desde el botón oculto (hold sobre el logo). */
  const activateManually = useCallback(() => {
    if (isActiveRef.current) return;
    // El ref se adelanta al re-render: el pointerup del propio gesto llega
    // antes, y sin esto `resetIdleTimer` lo vería todavía como "inactivo".
    isActiveRef.current = true;
    suppressActivityUntilRef.current = Date.now() + MANUAL_ACTIVATION_GRACE_MS;
    clearTimeout(timeoutRef.current);
    clearTimeout(exitTimerRef.current);
    setIsExiting(false);
    setIsActive(true);
  }, []);

  useEffect(() => {
    if (!hasAnySlideCandidate || isMirror) return;

    // Eventos que indican actividad del usuario
    const domEvents = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];

    domEvents.forEach((domEvent) => {
      window.addEventListener(domEvent, resetIdleTimer);
    });

    // Iniciar el timer inicial
    resetIdleTimer();

    // Cleanup
    return () => {
      clearTimeout(timeoutRef.current);
      domEvents.forEach((domEvent) => {
        window.removeEventListener(domEvent, resetIdleTimer);
      });
    };
  }, [hasAnySlideCandidate, isMirror, resetIdleTimer]);

  // Botón oculto: mantener presionado el logo del evento (el inferior, o el
  // superior si el evento no tiene inferior) durante TRIGGER_HOLD_MS abre el
  // salvapantallas al instante, sin esperar el timeout de inactividad. Sirve
  // para que el operador "cierre" la estación entre asistentes.
  //
  // Va como listener a nivel documento en fase de captura en vez de un onClick
  // por pantalla: el logo lo pintan muchos componentes y varios lo hacen dentro
  // de contenedores decorativos, así que un solo detector acá cubre todos.
  useEffect(() => {
    if (!hasAnySlideCandidate || !triggerLogoSrc || isMirror) return;

    const wantedSrc = toAbsoluteUrl(triggerLogoSrc);
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let startX = 0;
    let startY = 0;

    const cancelHold = () => {
      clearTimeout(holdTimer);
      holdTimer = undefined;
    };

    const isTriggerLogo = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const img = target.closest("img");
      if (!img) return false;
      const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src;
      return !!src && toAbsoluteUrl(src) === wantedSrc;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isActiveRef.current) return;
      if (!isTriggerLogo(e.target)) return;
      // Evita el arrastre de imagen del navegador y el "callout" de guardar
      // imagen que aparece al mantener presionado en táctil.
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = undefined;
        activateManually();
      }, TRIGGER_HOLD_MS);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!holdTimer) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > TRIGGER_MOVE_TOLERANCE_PX) {
        cancelHold();
      }
    };

    // En Android el menú contextual salta ~500ms después del pointerdown,
    // antes de que se complete el hold: se descarta mientras el gesto corre.
    const onContextMenu = (e: Event) => {
      if (holdTimer) e.preventDefault();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", cancelHold, true);
    document.addEventListener("pointercancel", cancelHold, true);
    document.addEventListener("contextmenu", onContextMenu, true);

    return () => {
      cancelHold();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", cancelHold, true);
      document.removeEventListener("pointercancel", cancelHold, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [hasAnySlideCandidate, triggerLogoSrc, isMirror, activateManually]);

  // Modo espejo: el estado no lo decide este tab, llega del líder.
  useEffect(() => {
    if (!isMirror) return;
    if (mirrorActive) {
      if (isActiveRef.current) return;
      isActiveRef.current = true;
      clearTimeout(exitTimerRef.current);
      setIsExiting(false);
      setIsActive(true);
    } else {
      // Misma animación de salida que en el líder (no-op si ya estaba cerrado).
      handleActivity();
    }
  }, [isMirror, mirrorActive, handleActivity]);

  // Avisa hacia afuera los cambios de estado — se dispara al empezar la
  // animación de SALIDA, no al terminarla, para que la pantalla espejo se
  // cierre en paralelo con el líder y no medio segundo tarde.
  const shownActive = isActive && !isExiting;
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const lastNotifiedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isMirror) return;
    if (lastNotifiedRef.current === shownActive) return;
    lastNotifiedRef.current = shownActive;
    onActiveChangeRef.current?.(shownActive);
  }, [isMirror, shownActive]);

  // Actividad programática: cada vez que cambia el paso del flujo (ver doc de
  // `activityKey`), cuenta como si el usuario hubiera interactuado.
  useEffect(() => {
    if (!hasAnySlideCandidate || isMirror) return;
    resetIdleTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityKey]);

  if (!hasAnySlideCandidate || !isActive) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black transition-transform duration-500 ease-in-out ${
        isExiting ? "translate-x-full" : "translate-x-0"
      }`}
    >
      {/* En espejo, tocar la pantalla no cierra nada: quien manda es el
          líder, y cerrar solo acá dejaría las dos pantallas desincronizadas. */}
      <ScreenSaverSlideshow event={event} onExit={isMirror ? NOOP : handleActivity} />
    </div>
  );
}
