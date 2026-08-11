"use client";

import React from "react";

export type BackgroundAnimationType = "NONE" | "FLOATING_ORBS";

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

/**
 * Animación de fondo opcional, configurable por evento. "NONE" no renderiza
 * nada (comportamiento original). "FLOATING_ORBS" dibuja esferas de colores
 * difuminadas derivando lentamente detrás del contenido.
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

  return null;
}
