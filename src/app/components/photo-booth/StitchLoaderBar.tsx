"use client";

import React from "react";

/**
 * Barra de carga decorativa "costura" de la splash (splashLoaderStyle
 * STITCH). Misma coreografía que la barra de pintura (`splash-anim-fill`, que
 * anima el ancho): una aguja va cosiendo de izquierda a derecha y deja detrás
 * puntadas del degradado `from`→`to`, sobre una guía de puntadas tenues aún
 * sin coser. Todo se dimensiona a partir de `height` (grosor de la puntada),
 * así sirve tanto con clamp() en el grid como con cqw en el layout libre.
 */
export default function StitchLoaderBar({
  width,
  height,
  from,
  to,
  className = "",
}: {
  width: string;
  /** Grosor de la puntada. */
  height: string;
  from: string;
  to: string;
  className?: string;
}) {
  // Puntada larga + espacio, en múltiplos del grosor: proporción de un
  // pespunte a mano (puntada ~3x más larga que el hueco).
  const dashes = `repeating-linear-gradient(90deg, #000 0, #000 calc(var(--stitch-h) * 2.4), transparent calc(var(--stitch-h) * 2.4), transparent calc(var(--stitch-h) * 3.4))`;

  return (
    <div
      className={`relative splash-loader-track ${className}`}
      style={
        { width, height, "--stitch-h": height, overflow: "visible" } as React.CSSProperties
      }
    >
      {/* Guía: puntadas tenues por coser. */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(120,80,10,.35)",
          maskImage: dashes,
          WebkitMaskImage: dashes,
          borderRadius: 999,
          opacity: 0.6,
        }}
        aria-hidden
      />
      {/* Lo ya cosido: crece con splash-anim-fill. */}
      <div className="splash-anim-fill relative h-full" style={{ overflow: "visible" }}>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, ${from}, ${to})`,
            maskImage: dashes,
            WebkitMaskImage: dashes,
            filter: "drop-shadow(0 1px 0 rgba(0,0,0,.25))",
          }}
          aria-hidden
        />
        {/* Aguja en la punta: entra y sale de la tela. */}
        <div
          className="absolute splash-anim-needle"
          style={{
            right: `calc(var(--stitch-h) * -0.6)`,
            bottom: `calc(var(--stitch-h) * 0.2)`,
            width: `calc(var(--stitch-h) * 0.75)`,
            height: `calc(var(--stitch-h) * 5)`,
            transformOrigin: "50% 100%",
          }}
          aria-hidden
        >
          {/* Cuerpo metálico con punta abajo y ojo arriba. */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(90deg, #8a8f98, #f4f6f9 45%, #a7adb6)",
              clipPath: "polygon(20% 0, 80% 0, 80% 82%, 50% 100%, 20% 82%)",
              borderRadius: "999px 999px 0 0",
            }}
          />
          <div
            className="absolute"
            style={{
              left: "35%",
              top: "8%",
              width: "30%",
              height: "16%",
              borderRadius: 999,
              background: "rgba(40,40,40,.55)",
            }}
          />
          {/* Hilo saliendo del ojo hacia atrás (lo ya cosido). */}
          <div
            className="absolute"
            style={{
              right: "50%",
              top: "14%",
              width: `calc(var(--stitch-h) * 3.2)`,
              height: `max(1px, calc(var(--stitch-h) * 0.22))`,
              background: to,
              borderRadius: 999,
              transformOrigin: "100% 50%",
              transform: "rotate(-24deg)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
