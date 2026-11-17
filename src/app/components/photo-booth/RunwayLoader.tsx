"use client";

import React, { useId } from "react";

/**
 * Efecto de carga "pasarela con flashes" (event.loadingEffect === "RUNWAY"),
 * alternativa al anillo de progreso de LoaderStep.
 *
 * Una pasarela en perspectiva: las luces de sus bordes se van encendiendo
 * desde adelante hacia el fondo con el progreso (son la barra de progreso),
 * un reflector ilumina el final cada vez más fuerte, y a los costados los
 * fotógrafos disparan flashes, cada vez más seguido a medida que se acerca
 * el final. SVG + CSS (keyframes `runwayPaparazzi` en globals.css).
 */

// Geometría en el viewBox 0 0 200 140: la pasarela va de la base (cerca) al
// horizonte (lejos), angostándose.
// La base de la pasarela queda un poco por encima del borde inferior de la
// escena: si no, el difuminado de abajo tapaba el primer foco.
const NEAR_Y = 128;
const FAR_Y = 40;
const NEAR_LEFT = 34;
const FAR_LEFT = 88;
const BULBS_PER_SIDE = 12;
/** Profundidad del último foco (relativa al primero): da la perspectiva. */
const DEPTH = 8;

const BULBS = Array.from({ length: BULBS_PER_SIDE }, (_, i) => {
  const d = 1 + (i * (DEPTH - 1)) / (BULBS_PER_SIDE - 1);
  // Proyección: y ∝ 1/d, normalizada entre la base y el horizonte.
  const s = 1 - (1 / d - 1 / DEPTH) / (1 - 1 / DEPTH);
  const y = NEAR_Y - (NEAR_Y - FAR_Y) * s;
  const xLeft = NEAR_LEFT + (FAR_LEFT - NEAR_LEFT) * s;
  return { y, xLeft, xRight: 200 - xLeft, r: 0.9 + 2.6 / d };
});

// Flashes de fotógrafos a los costados (en % de la escena). `from` = desde
// qué fracción del progreso empieza a disparar: al principio pocos, al final
// todos.
// Dentro del 12–88% horizontal y hasta el 86% vertical: más afuera los
// difumina la máscara de la escena.
const PAPARAZZI = [
  { left: 15, top: 62, size: 34, from: 0, duration: 2.6, delay: 0.2 },
  { left: 85, top: 70, size: 30, from: 0, duration: 3.1, delay: 1.3 },
  { left: 20, top: 82, size: 40, from: 0.12, duration: 2.2, delay: 0.7 },
  { left: 79, top: 52, size: 26, from: 0.2, duration: 2.8, delay: 1.9 },
  { left: 13, top: 45, size: 24, from: 0.3, duration: 2.4, delay: 0.4 },
  { left: 86, top: 84, size: 36, from: 0.38, duration: 2.0, delay: 1.1 },
  { left: 24, top: 50, size: 22, from: 0.48, duration: 1.8, delay: 0.9 },
  { left: 75, top: 80, size: 32, from: 0.56, duration: 1.7, delay: 0.3 },
  { left: 16, top: 74, size: 28, from: 0.66, duration: 1.5, delay: 1.5 },
  { left: 83, top: 60, size: 26, from: 0.74, duration: 1.4, delay: 0.6 },
  { left: 27, top: 86, size: 30, from: 0.82, duration: 1.3, delay: 1.0 },
  { left: 72, top: 86, size: 28, from: 0.88, duration: 1.2, delay: 0.1 },
];

const STAR_CLIP =
  "polygon(50% 0%, 57% 43%, 100% 50%, 57% 57%, 50% 100%, 43% 57%, 0% 50%, 43% 43%)";

const SCENE_MASK = [
  "linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%)",
  "linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%)",
].join(", ");

export default function RunwayLoader({
  progress,
  progressCap,
  percentColor,
  lightColor = "#FFF4D6",
  wide = false,
}: {
  /** 0..progressCap (simulado, ver LoaderStep). */
  progress: number;
  progressCap: number;
  percentColor: string;
  /** Color de los focos y el reflector (el de las luces de pasarela del evento). */
  lightColor?: string;
  /** Pantalla gigante (BoothMirror): escena más grande. */
  wide?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const t = Math.min(1, Math.max(0, progress / progressCap));
  const litCount = Math.round(t * BULBS_PER_SIDE);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div
        className="relative overflow-hidden"
        style={{
          width: "100%",
          maxWidth: wide ? 900 : 560,
          height: wide ? "clamp(380px, 50vh, 700px)" : "clamp(240px, 40vh, 460px)",
          maskImage: SCENE_MASK,
          WebkitMaskImage: SCENE_MASK,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
        role="img"
        aria-label={`Cargando ${progress}%`}
      >
        <svg viewBox="0 0 200 140" preserveAspectRatio="xMidYMax meet" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id={`floor-${uid}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.08} />
            </linearGradient>
            <linearGradient id={`spot-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lightColor} stopOpacity={0.9} />
              <stop offset="100%" stopColor={lightColor} stopOpacity={0} />
            </linearGradient>
            <radialGradient id={`end-${uid}`}>
              <stop offset="0%" stopColor={lightColor} stopOpacity={0.95} />
              <stop offset="100%" stopColor={lightColor} stopOpacity={0} />
            </radialGradient>
            <filter id={`glow-${uid}`} x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Reflector sobre el final de la pasarela: más fuerte con el progreso. */}
          <polygon
            points="100,-6 76,46 124,46"
            fill={`url(#spot-${uid})`}
            style={{ opacity: 0.25 + t * 0.6, transition: "opacity 0.3s linear" }}
          />
          <ellipse
            cx="100"
            cy={FAR_Y + 2}
            rx="26"
            ry="7"
            fill={`url(#end-${uid})`}
            style={{ opacity: 0.3 + t * 0.7, transition: "opacity 0.3s linear" }}
          />

          {/* Piso de la pasarela + línea central. */}
          <polygon
            points={`${FAR_LEFT},${FAR_Y} ${200 - FAR_LEFT},${FAR_Y} ${200 - NEAR_LEFT},${NEAR_Y} ${NEAR_LEFT},${NEAR_Y}`}
            fill={`url(#floor-${uid})`}
          />
          <line x1="100" y1={FAR_Y} x2="100" y2={NEAR_Y} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="3 4" />

          {/* Focos de los bordes: se encienden de adelante hacia el fondo. */}
          {BULBS.map((b, i) => {
            const lit = i < litCount;
            return (
              <g key={i} filter={lit ? `url(#glow-${uid})` : undefined}>
                {[b.xLeft, b.xRight].map((x, side) => (
                  <circle
                    key={side}
                    cx={x}
                    cy={b.y}
                    r={b.r}
                    fill={lit ? lightColor : "#ffffff"}
                    fillOpacity={lit ? 1 : 0.18}
                    style={{ transition: "fill-opacity 0.3s ease-out" }}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Flashes de los fotógrafos a los costados. */}
        {PAPARAZZI.filter((p) => t >= p.from).map((p, i) => (
          <span
            key={i}
            className="absolute runway-paparazzi"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size * (wide ? 2.1 : 1.4),
              height: p.size * (wide ? 2.1 : 1.4),
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
            aria-hidden
          >
            <span
              className="absolute rounded-full"
              style={{
                inset: "-60%",
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(210,230,255,0.35) 35%, rgba(255,255,255,0) 70%)",
              }}
            />
            <span className="absolute inset-0 bg-white" style={{ clipPath: STAR_CLIP }} />
          </span>
        ))}
      </div>

      <span
        className="font-black drop-shadow-sm tabular-nums"
        style={{
          fontSize: wide ? "clamp(2.4rem, 6vmin, 3.6rem)" : "clamp(1.7rem, 4.5vmin, 2.5rem)",
          color: percentColor,
        }}
      >
        {progress}%
      </span>
    </div>
  );
}
