/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getAspectDims, type PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";
import {
  interleaveByPrompt,
  loadScreenSaverPhotos,
  type ScreenSaverPhoto,
} from "@/app/components/common/screenSaverPhotos";

/** Tope de fotos por pasada. El original de referencia usa 10; con más, cada
 * una queda muy poco tiempo en pantalla para alcanzar a mirarla. */
const MAX_CARDS_PER_RUN = 8;

/** Lo mínimo que una tarjeta tiene que quedarse quieta para que se pueda
 * mirar. Por debajo de esto la pila es un parpadeo, no una secuencia. */
const MIN_MS_PER_CARD = 850;

/**
 * Guion de la secuencia, en FRACCIONES de la duración total (no en segundos
 * fijos): el ScreenSaver le da a cada pantalla `screenSaverSlideDurationSec`
 * y después pasa a la siguiente, así que con tiempos absolutos la secuencia
 * quedaba cortada a la mitad en unos eventos y con la última escena colgada
 * en otros. Con fracciones, la coreografía entra completa y termina en el
 * logo justo antes del cambio de pantalla, dure lo que dure el turno.
 */
const ACT = {
  /** Aparece la carpeta con su etiqueta. */
  folder: 0,
  /** Entra el cursor y hace click. */
  cursor: 0.18,
  /** La carpeta se abre y sale la pila de fotos. */
  open: 0.36,
  /** Las tarjetas se van pasando de a una. */
  cards: 0.52,
  /** Cierre con el logo del evento. */
  logo: 0.82,
} as const;

type Phase = keyof typeof ACT;
const PHASE_ORDER: Phase[] = ["folder", "cursor", "open", "cards", "logo"];

/**
 * Cuántas fotos entran en una pasada, según cuánto dura el turno.
 *
 * El acto de tarjetas se lleva una fracción fija del turno (ver ACT), así que
 * con un turno corto meter el tope de fotos las dejaba en ~375ms cada una: se
 * veía como un parpadeo. Acá se reparte al revés — primero cuánto tiempo hay,
 * después cuántas fotos entran cómodas ahí.
 */
function cardsForDuration(durationSec: number): number {
  const cardsWindowMs = (ACT.logo - ACT.cards) * Math.max(6, durationSec) * 1000;
  const fits = Math.floor(cardsWindowMs / MIN_MS_PER_CARD);
  return Math.max(3, Math.min(MAX_CARDS_PER_RUN, fits));
}

/** ALTO de la pila; el ancho se deriva de la relación de aspecto del evento
 * (ver `cardSizeCss`).
 *
 * Se dimensiona por alto y no por ancho porque el alto es la restricción real
 * de la pantalla: la secuencia tiene que entrar entera. Atado al ancho, un evento de fotos cuadradas terminaba con una tarjeta más
 * chica que uno de 3:4 sin ninguna razón; por alto, ambos usan todo el
 * espacio vertical disponible. Como va en vmin, el ancho resultante nunca
 * puede desbordar el lado corto. */
const CARD_HEIGHT_CSS = "clamp(325px, 72.5vmin, 950px)";

/** Puntero clásico de sistema operativo. Va como path a mano (no un emoji ni
 * un icono de librería) para poder darle el borde blanco y la sombra que lo
 * hacen legible sobre cualquier foto. */
function CursorArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M5 2.5 L5 19.5 L9.4 15.6 L12.2 21.5 L15.1 20.1 L12.4 14.4 L18.5 14.1 Z"
        fill="#111827"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Pantalla de "carpeta de fotos" del ScreenSaver.
 *
 * Secuencia, en loop: sobre fondo claro aparece una carpeta 3D con la
 * etiqueta del evento → un cursor grande entra y la selecciona → la carpeta
 * se abre y de ella sale una pila de fotos del evento → las tarjetas se van
 * pasando de a una → cierra con el logo del evento. Al terminar vuelve a empezar con OTRAS fotos.
 *
 * La coreografía está escrita como fracciones de la duración del turno (ver
 * ACT) para que siempre entre completa, y las fotos salen de un pozo grande
 * barajado, para que dos pasadas seguidas no se parezcan.
 */
export default function ScreenSaverPhotoFolder({
  eventId,
  promptIds,
  aspectRatio,
  active = true,
  durationSec = 10,
  label,
  logoUrl,
  onPhotosChange,
}: {
  eventId: string;
  /** Prompts asignados al evento (`event.prompts`). Solo se muestran fotos
   * generadas con los que además siguen ACTIVOS: un evento acumula fotos de
   * prompts que después se le sacaron o se dieron de baja (en tito_pabon son
   * el 41% de su historial), y esas ya no representan al evento. */
  promptIds?: string[];
  /** Relación de aspecto de las fotos del evento (`photoAspectRatio`). La
   * tarjeta adopta esa forma para que la foto entre COMPLETA y además llene el
   * marco: con una tarjeta de forma fija habría que elegir entre recortarla o
   * dejarle franjas blancas. */
  aspectRatio?: PhotoAspectRatio;
  /** Falso mientras otra pantalla del screensaver está al frente: la
   * secuencia se congela y vuelve a arrancar desde el principio cuando le
   * toca el turno, en vez de aparecer empezada por la mitad. */
  active?: boolean;
  /** Duración del turno de esta pantalla (viene de
   * `screenSaverSlideDurationSec`). La coreografía se reparte adentro. */
  durationSec?: number;
  /** Etiqueta de la carpeta (por defecto, el nombre del evento). */
  label: string;
  /** Logo del cierre, ya resuelto por quien monta la pantalla:
   * `screenSaverFolderLogo` del evento si se subió uno en el admin, y si no
   * el `logoTop`. */
  logoUrl?: string;
  /** Mismo contrato que ScreenSaverGallery: le avisa al rotador si esta
   * pantalla tiene contenido, para no darle el turno a una carpeta vacía. */
  onPhotosChange?: (count: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [pool, setPool] = useState<ScreenSaverPhoto[]>([]);
  const [run, setRun] = useState<ScreenSaverPhoto[]>([]);
  const [phase, setPhase] = useState<Phase>("folder");
  const [cardIndex, setCardIndex] = useState(0);
  /** Cambia en cada pasada para remontar las animaciones desde cero. */
  const [runKey, setRunKey] = useState(0);
  const poolRef = useRef<ScreenSaverPhoto[]>([]);
  poolRef.current = pool;
  // El efecto de carga solo depende de `eventId`; lee la duración por ref para
  // no tener que reconsultar Firestore si el admin cambia el turno.
  const durationSecRef = useRef(durationSec);
  durationSecRef.current = durationSec;

  // `promptIds` suele llegar como literal nuevo en cada render del padre; sin
  // esto el efecto de carga se dispararía en cada uno.
  const promptKey = (promptIds ?? []).join(",");

  // Lectura puntual, no onSnapshot como ScreenSaverGallery — ver
  // `loadScreenSaverPhotos`, que es la misma consulta que usa la animación
  // editorial.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const photos = await loadScreenSaverPhotos(
          eventId,
          promptKey ? promptKey.split(",") : []
        );

        if (!alive) return;
        setPool(photos);
        setRun(interleaveByPrompt(photos).slice(0, cardsForDuration(durationSecRef.current)));
        onPhotosChange?.(photos.length);
      } catch {
        if (alive) onPhotosChange?.(0);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, promptKey]);

  // Reloj de la coreografía. Un timeout por acto (no un interval): así cada
  // escena entra en su momento exacto aunque el navegador atrase un frame.
  useEffect(() => {
    if (!active || run.length === 0) return;

    const totalMs = Math.max(6, durationSec) * 1000;
    const timers: ReturnType<typeof setTimeout>[] = [];

    setPhase("folder");
    setCardIndex(0);

    for (const name of PHASE_ORDER) {
      if (name === "folder") continue;
      timers.push(setTimeout(() => setPhase(name), ACT[name] * totalMs));
    }

    // Paso de tarjetas: reparte las fotos en la ventana del acto "cards".
    const cardsWindow = (ACT.logo - ACT.cards) * totalMs;
    const perCard = cardsWindow / Math.max(1, run.length);
    for (let i = 1; i < run.length; i++) {
      timers.push(setTimeout(() => setCardIndex(i), ACT.cards * totalMs + perCard * i));
    }

    // Fin de la pasada: se rebaraja el pozo y arranca de nuevo con otras.
    timers.push(
      setTimeout(() => {
        setRun(interleaveByPrompt(poolRef.current).slice(0, cardsForDuration(durationSec)));
        setRunKey((k) => k + 1);
      }, totalMs)
    );

    return () => timers.forEach(clearTimeout);
  }, [active, durationSec, run.length, runKey]);

  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const folderOpen = phaseIndex >= PHASE_ORDER.indexOf("open");
  const showCards = phaseIndex >= PHASE_ORDER.indexOf("open");
  const showLogo = phase === "logo";

  /** Rotaciones fijas por posición de la pila (no aleatorias por render): con
   * `Math.random()` en el render, cada re-render movía las tarjetas ya
   * quietas y la pila "temblaba". */
  /** Tamaño de la tarjeta con la forma real de las fotos del evento: cuadrada
   * da una tarjeta cuadrada, 3:4 una vertical — en ambos casos con el mismo
   * alto, que es lo que hace que la foto se vea lo más grande posible. */
  const cardSizeCss = useMemo(() => {
    const { w, h } = getAspectDims(aspectRatio);
    return {
      width: `calc(${CARD_HEIGHT_CSS} * ${w} / ${h})`,
      height: CARD_HEIGHT_CSS,
    };
  }, [aspectRatio]);

  const tilts = useMemo(
    () => [-6, 4, -3, 7, -5, 2, -8, 5].map((deg) => (reduceMotion ? 0 : deg)),
    [reduceMotion]
  );

  if (run.length === 0) return null;

  const remaining = run.slice(cardIndex);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#f4f5f7] flex items-center justify-center">
      {/* Retícula tenue: le da el aire de interfaz de computador del original
          sin competir con las fotos. */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15,23,42,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.045) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
        aria-hidden
      />

      <div className="relative w-full h-full flex items-center justify-center" style={{ perspective: "1200px" }}>
        {/* ---------- Carpeta ---------- */}
        <AnimatePresence>
          {!showCards && (
            <motion.div
              key={`folder-${runKey}`}
              className="absolute flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.82, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.35, filter: "blur(6px)" }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="relative"
                style={{
                  width: "clamp(210px, 38vmin, 470px)",
                  height: "clamp(160px, 29vmin, 360px)",
                  transformStyle: "preserve-3d",
                }}
                // El "click" del cursor: la carpeta se hunde apenas y rebota.
                animate={phase === "open" ? { scale: [1, 0.94, 1.04] } : { scale: 1 }}
                transition={{ duration: 0.45 }}
              >
                {/* Pestaña */}
                <div
                  className="absolute left-0 top-0 rounded-t-xl"
                  style={{
                    width: "42%",
                    height: "18%",
                    background: "linear-gradient(180deg, #60a5fa, #3b82f6)",
                  }}
                />
                {/* Cuerpo */}
                <div
                  className="absolute inset-x-0 bottom-0 rounded-2xl"
                  style={{
                    top: "12%",
                    background: "linear-gradient(160deg, #3b82f6, #1d4ed8)",
                    boxShadow: "0 26px 50px -18px rgba(29,78,216,0.65)",
                  }}
                />
                {/* Tapa: se abre girando desde su borde inferior. */}
                <motion.div
                  className="absolute inset-x-0 bottom-0 rounded-2xl origin-bottom"
                  style={{
                    top: "26%",
                    background: "linear-gradient(160deg, #93c5fd, #3b82f6)",
                    boxShadow: "0 -6px 18px rgba(15,23,42,0.18) inset",
                  }}
                  animate={folderOpen ? { rotateX: -72 } : { rotateX: 0 }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                />
              </motion.div>

              <div
                className="mt-5 font-semibold text-slate-700 text-center px-4"
                style={{ fontSize: "clamp(0.95rem, 2.4vmin, 1.6rem)", letterSpacing: "0.01em" }}
              >
                {label}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- Cursor ---------- */}
        <AnimatePresence>
          {(phase === "cursor" || phase === "open") && !reduceMotion && (
            <motion.div
              key={`cursor-${runKey}`}
              className="absolute pointer-events-none"
              style={{ width: "clamp(38px, 7vmin, 78px)", zIndex: 30 }}
              initial={{ x: "42vmin", y: "38vmin", opacity: 0, scale: 1.1 }}
              animate={{
                x: "3vmin",
                y: "4vmin",
                opacity: 1,
                scale: phase === "open" ? 0.86 : 1,
              }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: phase === "open" ? 0.22 : 0.95, ease: [0.22, 1, 0.36, 1] }}
            >
              <CursorArrow className="w-full h-auto drop-shadow-[0_6px_10px_rgba(15,23,42,0.35)]" />
              {/* Onda del click */}
              {phase === "open" && (
                <motion.span
                  className="absolute rounded-full border-2 border-blue-500/70"
                  style={{ left: "-40%", top: "-40%", width: "180%", height: "180%" }}
                  initial={{ scale: 0.2, opacity: 0.8 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- Pila de fotos ---------- */}
        <AnimatePresence>
          {showCards && !showLogo && (
            <motion.div
              key={`stack-${runKey}`}
              className="absolute flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4 }}
            >
              <div
                className="relative"
                /* La pila es la protagonista de la pantalla: ocupa la mayor
                   parte del alto disponible. Las medidas van en vmin, así crece
                   parejo desde la tablet vertical hasta la pantalla gigante sin
                   recortarse por el lado corto. El alto sale de la relación de
                   aspecto del evento (ver cardHeightCss), no de un valor fijo:
                   es lo que permite que la foto entre entera y llene el marco
                   al mismo tiempo. */
                style={cardSizeCss}
              >
                {/* Se dibujan en orden inverso para que la primera de
                    `remaining` quede arriba de la pila. */}
                {remaining
                  .slice(0, 5)
                  .map((photo, depth) => ({ photo, depth }))
                  .reverse()
                  .map(({ photo, depth }) => (
                    <motion.div
                      key={photo.id}
                      className="absolute inset-0 rounded-3xl overflow-hidden bg-white"
                      style={{
                        boxShadow: "0 34px 70px -24px rgba(15,23,42,0.5)",
                        border: "clamp(6px, 1.1vmin, 14px) solid #ffffff",
                        zIndex: 10 - depth,
                      }}
                      initial={{ opacity: 0, y: 60, scale: 0.9, rotate: 0 }}
                      animate={{
                        opacity: 1,
                        y: depth * -16,
                        x: depth * 11,
                        scale: 1 - depth * 0.04,
                        rotate: tilts[depth % tilts.length],
                      }}
                      exit={{
                        // La de arriba se va de costado, como si la
                        // descartaran de la pila.
                        x: reduceMotion ? 0 : "85vmin",
                        rotate: reduceMotion ? 0 : 16,
                        opacity: 0,
                        transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
                      }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <img
                        src={photo.url}
                        alt=""
                        /* `contain`, no `cover`: la tarjeta ya tiene la forma
                           de las fotos del evento, así que normalmente llena
                           igual; y si alguna foto vieja tiene otra proporción,
                           se ve entera en vez de recortada. */
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    </motion.div>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- Cierre: logo del evento ---------- */}
        <AnimatePresence>
          {showLogo && logoUrl && (
            <motion.div
              key={`logo-${runKey}`}
              className="absolute flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <img
                src={logoUrl}
                alt=""
                className="object-contain"
                style={{ maxWidth: "74vmin", maxHeight: "55vmin" }}
                draggable={false}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
