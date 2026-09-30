/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";

/**
 * Efecto de carga "cohete despegando" (event.loadingEffect === "ROCKET"),
 * alternativa al anillo de progreso de LoaderStep.
 *
 * El cohete sube con el progreso (acelerando, como un despegue real: arranca
 * lento sobre la nube de humo de la plataforma y va ganando velocidad),
 * vibra, echa fuego por la tobera y deja una estela. Las líneas de velocidad
 * del fondo se hacen más visibles a medida que sube.
 *
 * Todo es CSS (keyframes en globals.css, prefijo `rocket-`) sobre un único
 * PNG sin fondo (public/loading/rocket.png, recortado a su contenido: 160x425).
 */

const ROCKET_SRC = "/loading/rocket.png";
const ROCKET_ASPECT = 160 / 425;
// Posición de la tobera dentro del PNG recortado (en % de su alto): el fuego
// sale de ahí, por detrás de las aletas.
const NOZZLE_TOP_PCT = 84;

// Líneas de velocidad: posiciones fijas (no aleatorias por render).
const STREAKS = [
  { left: "8%", delay: 0, duration: 0.9, h: 18 },
  { left: "18%", delay: -0.5, duration: 1.2, h: 12 },
  { left: "27%", delay: -0.2, duration: 0.8, h: 22 },
  { left: "71%", delay: -0.7, duration: 1.0, h: 16 },
  { left: "80%", delay: -0.3, duration: 0.85, h: 20 },
  { left: "91%", delay: -0.9, duration: 1.15, h: 14 },
];

const SCENE_MASK = [
  "linear-gradient(to bottom, transparent 0%, #000 10%, #000 88%, transparent 100%)",
  "linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)",
].join(", ");

// Chispas que caen de la tobera.
const SPARKS = [
  { x: -18, delay: 0, duration: 0.7 },
  { x: 14, delay: -0.25, duration: 0.6 },
  { x: -6, delay: -0.45, duration: 0.8 },
  { x: 22, delay: -0.1, duration: 0.65 },
  { x: -26, delay: -0.55, duration: 0.75 },
];

// Nubes de humo de la plataforma de lanzamiento.
const PUFFS = [
  { left: "34%", size: 38, delay: 0 },
  { left: "50%", size: 46, delay: -0.8 },
  { left: "66%", size: 38, delay: -1.6 },
  { left: "24%", size: 28, delay: -1.2 },
  { left: "76%", size: 28, delay: -0.4 },
];

export default function RocketLoader({
  progress,
  progressCap,
  percentColor,
  wide = false,
}: {
  /** 0..progressCap (simulado, ver LoaderStep). */
  progress: number;
  progressCap: number;
  percentColor: string;
  /** Pantalla gigante (BoothMirror): escena más grande. */
  wide?: boolean;
}) {
  // 0..1 con aceleración (ease-in): lento al despegar, rápido después.
  const t = Math.min(1, Math.max(0, progress / progressCap));
  const climb = Math.pow(t, 1.6);
  // Base del cohete dentro de la escena (en % del alto): de la plataforma
  // hasta cerca del borde superior.
  const bottomPct = 14 + climb * 34;

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div
        className="relative overflow-hidden"
        style={{
          // Bastante más ancha que el cohete: el resplandor del motor y el
          // humo se abren hacia los costados, y con una escena angosta se
          // cortaban en seco contra sus bordes (se veía una línea vertical
          // sobre el fondo del evento).
          width: "100%",
          maxWidth: wide ? 900 : 560,
          height: wide ? "clamp(420px, 56vh, 780px)" : "clamp(280px, 46vh, 520px)",
          // Todos los bordes difuminados (vertical Y horizontal, intersección
          // de las dos máscaras): lo que se acerca al borde se desvanece en
          // el fondo en vez de cortarse.
          maskImage: SCENE_MASK,
          WebkitMaskImage: SCENE_MASK,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
        role="img"
        aria-label={`Cargando ${progress}%`}
      >
        {/* Columna central, del ancho del cohete + humo: las posiciones y
            tamaños en % de las líneas, la estela y el humo son de esta
            columna, no de la escena (que es ancha solo para dar aire). */}
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2"
          style={{ width: wide ? "clamp(260px, 36vmin, 460px)" : "clamp(180px, 34vmin, 300px)" }}
        >
          {/* Líneas de velocidad, más visibles cuanto más alto va. */}
          <div className="absolute inset-0" style={{ opacity: 0.15 + climb * 0.7 }} aria-hidden>
            {STREAKS.map((s, i) => (
              <span
                key={i}
                className="absolute top-0 w-[2px] rounded-full bg-white/70 rocket-streak"
                style={{
                  left: s.left,
                  height: `${s.h}%`,
                  animationDelay: `${s.delay}s`,
                  animationDuration: `${s.duration}s`,
                }}
              />
            ))}
          </div>

          {/* Estela: columna de humo entre la plataforma y la tobera. */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-0 rounded-t-full"
            style={{
              width: "18%",
              // Llega hasta dentro del fuego (que se afina hacia la punta), para
              // que no quede un hueco entre la llama y la estela.
              height: `${bottomPct + 8}%`,
              background:
                "linear-gradient(to top, rgba(255,255,255,0.55), rgba(255,220,180,0.35) 60%, rgba(255,160,60,0.0))",
              filter: "blur(8px)",
              transition: "height 0.2s linear",
            }}
            aria-hidden
          />

          {/* Nube de humo de la plataforma: fuerte al despegar, se disipa. */}
          <div
            className="absolute inset-x-0 bottom-0 h-[22%]"
            style={{ opacity: Math.max(0, 1 - climb * 1.6), transition: "opacity 0.3s linear" }}
            aria-hidden
          >
            {PUFFS.map((p, i) => (
              <span
                key={i}
                className="absolute bottom-[8%] -translate-x-1/2 rounded-full bg-white/80 rocket-puff"
                style={{
                  left: p.left,
                  width: `${p.size}%`,
                  aspectRatio: "1",
                  filter: "blur(6px)",
                  animationDelay: `${p.delay}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Cohete */}
        <div
          className="absolute left-1/2"
          style={{
            bottom: `${bottomPct}%`,
            height: "50%",
            aspectRatio: `${ROCKET_ASPECT}`,
            transform: "translateX(-50%)",
            transition: "bottom 0.2s linear",
          }}
        >
          <div className="relative w-full h-full rocket-shake">
            {/* Resplandor del motor */}
            <span
              className="absolute left-1/2 -translate-x-1/2 rounded-full rocket-glow"
              style={{
                top: `${NOZZLE_TOP_PCT}%`,
                width: "170%",
                aspectRatio: "1",
                marginTop: "-40%",
                background: "radial-gradient(circle, rgba(255,170,60,0.55) 0%, rgba(255,90,20,0.25) 40%, transparent 70%)",
              }}
              aria-hidden
            />

            {/* Fuego: capa externa (rojo/naranja) + núcleo (amarillo/blanco).
                Detrás del PNG, así las aletas quedan por delante. */}
            <span
              className="absolute left-1/2 rocket-flame"
              style={{
                top: `${NOZZLE_TOP_PCT}%`,
                width: "62%",
                height: "80%",
                background:
                  "radial-gradient(ellipse 50% 70% at 50% 18%, #fff7c2 0%, #ffd23f 22%, #ff8a1f 48%, rgba(230,40,20,0.85) 70%, rgba(230,40,20,0) 100%)",
                borderRadius: "50% 50% 50% 50% / 30% 30% 70% 70%",
                filter: "blur(1.5px)",
              }}
              aria-hidden
            />
            <span
              className="absolute left-1/2 rocket-flame-core"
              style={{
                top: `${NOZZLE_TOP_PCT}%`,
                width: "32%",
                height: "44%",
                background: "radial-gradient(ellipse 50% 60% at 50% 20%, #ffffff 0%, #fff3a0 45%, rgba(255,200,60,0) 100%)",
                borderRadius: "50% 50% 50% 50% / 30% 30% 70% 70%",
              }}
              aria-hidden
            />

            {/* Chispas */}
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="absolute left-1/2 w-[5px] h-[5px] rounded-full bg-amber-200 rocket-spark"
                style={
                  {
                    top: `${NOZZLE_TOP_PCT + 20}%`,
                    "--spark-x": `${s.x}px`,
                    animationDelay: `${s.delay}s`,
                    animationDuration: `${s.duration}s`,
                  } as React.CSSProperties
                }
                aria-hidden
              />
            ))}

            <img
              src={ROCKET_SRC}
              alt=""
              draggable={false}
              className="relative w-full h-full object-contain select-none drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
            />
          </div>
        </div>
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
