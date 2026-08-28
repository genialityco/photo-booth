"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import ScreenSaverSlideshow from "@/app/components/common/ScreenSaverSlideshow";

/**
 * Shell del salvapantallas: detecta inactividad y muestra el overlay a
 * pantalla completa (con animación de entrada/salida) cuando corresponde. El
 * contenido en sí (loop de media → splash → galería → filtros) lo arma
 * ScreenSaverSlideshow — ver ese componente para el detalle de cada slide.
 */
export default function ScreenSaver({
  event,
  activityKey,
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
}) {
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

  const [isActive, setIsActive] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  // Ref en vez de depender del estado `isActive`: así `resetIdleTimer` no
  // necesita recrearse (ni el efecto de listeners DOM reengancharse) cada vez
  // que el salvapantalla entra/sale.
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleActivity = useCallback(() => {
    if (isActiveRef.current) {
      // Iniciar animación de salida
      setIsExiting(true);
      // Después de la animación, ocultar completamente
      setTimeout(() => {
        setIsActive(false);
        setIsExiting(false);
      }, 500); // Duración de la animación
    }
  }, []);

  // Reinicia el reloj de inactividad — usado tanto por los listeners DOM
  // reales como por los cambios de `activityKey` (actividad "programática").
  const resetIdleTimer = useCallback(() => {
    clearTimeout(timeoutRef.current);
    if (isActiveRef.current) handleActivity();
    timeoutRef.current = setTimeout(() => setIsActive(true), timeoutMs);
  }, [timeoutMs, handleActivity]);

  useEffect(() => {
    if (!hasAnySlideCandidate) return;

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
  }, [hasAnySlideCandidate, resetIdleTimer]);

  // Actividad programática: cada vez que cambia el paso del flujo (ver doc de
  // `activityKey`), cuenta como si el usuario hubiera interactuado.
  useEffect(() => {
    if (!hasAnySlideCandidate) return;
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
      <ScreenSaverSlideshow event={event} onExit={handleActivity} />
    </div>
  );
}
