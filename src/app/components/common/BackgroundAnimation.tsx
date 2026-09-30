"use client";

import React from "react";

export type BackgroundAnimationType = "NONE" | "FLOATING_ORBS" | "TOP_STARS";

// Config fija (no aleatoria por render) de cada esfera: color, tamaño,
// posición inicial, duración/retraso de su animación de deriva.
const ORBS: Array<{
  color: string;
  size: number;
  top: string;
  left: string;
  duration: number;
  delay: number;
}> = [
  { color: "#ef4444", size: 260, top: "8%", left: "10%", duration: 42, delay: 0 },
  { color: "#22d3ee", size: 200, top: "60%", left: "78%", duration: 36, delay: -6 },
  { color: "#a78bfa", size: 320, top: "70%", left: "15%", duration: 48, delay: -20 },
  { color: "#4ade80", size: 180, top: "15%", left: "70%", duration: 32, delay: -14 },
  { color: "#ec4899", size: 240, top: "40%", left: "45%", duration: 44, delay: -28 },
  { color: "#facc15", size: 150, top: "85%", left: "55%", duration: 30, delay: -4 },
];

// PRNG con semilla fija: las estrellas salen siempre en el mismo lugar
// (sin saltos entre renders ni diferencias servidor/cliente al hidratar).
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Estrellas en los 2/3 superiores: `top` va de 0% a ~95% del contenedor con
// algo más de densidad arriba (r^1.3), y se hacen más chicas/tenues hacia abajo.
const STARS = (() => {
  const rand = seededRandom(1337);
  return Array.from({ length: 130 }, () => {
    const depth = Math.pow(rand(), 1.3); // 0 = borde superior
    const size = (depth < 0.5 ? 1.5 : 1) + rand() * (depth < 0.5 ? 2.5 : 1.5);
    return {
      top: `${(depth * 95).toFixed(2)}%`,
      left: `${(rand() * 100).toFixed(2)}%`,
      size,
      maxOpacity: 0.95 - depth * 0.55,
      duration: 2.5 + rand() * 4,
      delay: -rand() * 6,
      glow: size > 3,
    };
  });
})();

// Estrellas fugaces, cruzando solo la franja superior en diagonal.
const SHOOTING_STARS = [
  { top: "6%", left: "12%", duration: 9, delay: 1 },
  { top: "14%", left: "55%", duration: 13, delay: 5 },
  { top: "3%", left: "78%", duration: 17, delay: 10 },
];

/**
 * Animación de fondo opcional, configurable por evento. "NONE" no renderiza
 * nada (comportamiento original). "FLOATING_ORBS" dibuja esferas de colores
 * difuminadas derivando lentamente detrás del contenido. "TOP_STARS" dibuja
 * un cielo de estrellas titilando (y alguna fugaz) solo en la parte superior,
 * desvaneciéndose al llegar a los 2/3 de la pantalla.
 */
export default function BackgroundAnimation({ type }: { type?: BackgroundAnimationType }) {
  if (!type || type === "NONE") return null;

  if (type === "FLOATING_ORBS") {
    // z-[-1]: por encima de los fondos de imagen "fixed -z-10" que cada
    // pantalla (SplashScreen, EventPhotoBoothLanding, PhotoBoothWizard)
    // dibuja para sí misma, pero por debajo del contenido real.
    return (
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none" aria-hidden>
        {ORBS.map((orb, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-orb-float"
            style={{
              backgroundColor: orb.color,
              width: orb.size,
              height: orb.size,
              top: orb.top,
              left: orb.left,
              filter: "blur(50px)",
              opacity: 0.45,
              mixBlendMode: "screen",
              animationDuration: `${orb.duration}s`,
              animationDelay: `${orb.delay}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (type === "TOP_STARS") {
    return (
      <div
        className="fixed inset-x-0 top-0 h-[67%] z-[-1] overflow-hidden pointer-events-none"
        style={{
          // Se desvanece hacia abajo para no cortar en seco a mitad de pantalla.
          maskImage: "linear-gradient(to bottom, black 0%, black 75%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 75%, transparent 100%)",
        }}
        aria-hidden
      >
        {STARS.map((star, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white bg-star-twinkle"
            style={
              {
                top: star.top,
                left: star.left,
                width: star.size,
                height: star.size,
                boxShadow: star.glow
                  ? `0 0 ${star.size * 2}px ${star.size / 2}px rgba(255,255,255,0.6)`
                  : undefined,
                "--star-max": star.maxOpacity,
                animationDuration: `${star.duration}s`,
                animationDelay: `${star.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
        {SHOOTING_STARS.map((s, i) => (
          <div
            key={`s${i}`}
            className="absolute bg-shooting-star"
            style={{
              top: s.top,
              left: s.left,
              animationDuration: `${s.duration}s`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>
    );
  }

  return null;
}
