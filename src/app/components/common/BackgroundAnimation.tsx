"use client";

import React from "react";

export type BackgroundAnimationType =
  | "NONE"
  | "FLOATING_ORBS"
  | "TOP_STARS"
  | "LOGO_RAIN"
  | "RUNWAY_LIGHTS";

export const RUNWAY_LIGHTS_DEFAULT_COLOR = "#FFF4D6";
/** Media apertura de cada haz, en grados. */
const BEAM_HALF_ANGLE = 35;

// Reflectores de pasarela: cada uno sale del borde lateral a una altura
// (`top`) y barre entre dos ángulos. Los del lado derecho son los mismos
// espejados, con tiempos corridos para que no se muevan en espejo perfecto.
const RUNWAY_BEAMS: Array<{
  top: number;
  from: number;
  to: number;
  duration: number;
  delay: number;
  length: number;
}> = [
  { top: 6, from: 8, to: 38, duration: 7, delay: 0, length: 95 },
  { top: 30, from: -12, to: 22, duration: 9, delay: -3, length: 85 },
  { top: 58, from: -28, to: 6, duration: 8, delay: -5, length: 80 },
  { top: 84, from: -40, to: -10, duration: 10, delay: -2, length: 90 },
];

export const LOGO_RAIN_DEFAULT_COUNT = 24;
export const LOGO_RAIN_DEFAULT_SIZE_PX = 80;

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

// Gotas de la "lluvia de logos": posición, tamaño, velocidad y giro fijos
// por índice (misma semilla siempre), así no saltan entre renders. Solo el
// logo que le toca a cada gota depende de la lista configurada.
function buildRainDrops(count: number) {
  const rand = seededRandom(4242);
  return Array.from({ length: count }, (_, i) => ({
    // Repartidas en franjas para que no se amontonen todas en un costado.
    left: ((i + rand()) / count) * 100,
    scale: 0.65 + rand() * 0.7,
    duration: 9 + rand() * 9,
    delay: -rand() * 18,
    rot0: Math.round(rand() * 360),
    spin: (rand() < 0.5 ? -1 : 1) * Math.round(90 + rand() * 270),
    sway: Math.round((rand() - 0.5) * 16),
    opacity: 0.55 + rand() * 0.4,
  }));
}

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
 * desvaneciéndose al llegar a los 2/3 de la pantalla. "LOGO_RAIN" hace caer
 * los logos subidos en el admin (`logoRainImages`) como lluvia, girando.
 * "RUNWAY_LIGHTS" dibuja reflectores de pasarela a los costados que barren
 * hacia el centro, del color `runwayLightsColor`.
 */
export default function BackgroundAnimation({
  type,
  contained = false,
  logos,
  logoCount,
  logoSizePx,
  lightsColor,
}: {
  /** Solo RUNWAY_LIGHTS: color de los haces (hex). */
  lightsColor?: string;
  type?: BackgroundAnimationType;
  /** Solo LOGO_RAIN: URLs de los logos que caen (se reparten en orden). */
  logos?: string[];
  /** Solo LOGO_RAIN: cuántos logos hay en pantalla a la vez. */
  logoCount?: number;
  /** Solo LOGO_RAIN: tamaño base de cada logo en px (varía ±35%). */
  logoSizePx?: number;
  /** Para montarla DENTRO de una pantalla que pinta su propio fondo opaco a
   * pantalla completa (CaptureStep/FrameCamera, LoaderStep), que si no la
   * taparía. `absolute` sin z-index: queda en el orden del DOM, así que hay
   * que ponerla justo después de la imagen de fondo y antes del contenido. */
  contained?: boolean;
}) {
  if (!type || type === "NONE") return null;

  // Por defecto (booth/[slug]) z-[-1]: por encima de los fondos de imagen
  // "fixed -z-10" que cada pantalla dibuja para sí misma, pero por debajo
  // del contenido real.
  const layer = contained ? "absolute" : "fixed z-[-1]";

  if (type === "FLOATING_ORBS") {
    return (
      <div className={`${layer} inset-0 overflow-hidden pointer-events-none`} aria-hidden>
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
        className={`${layer} inset-x-0 top-0 h-[67%] overflow-hidden pointer-events-none`}
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

  if (type === "LOGO_RAIN") {
    return <LogoRain layer={layer} logos={logos} count={logoCount} sizePx={logoSizePx} />;
  }

  if (type === "RUNWAY_LIGHTS") {
    return <RunwayLights layer={layer} color={lightsColor || RUNWAY_LIGHTS_DEFAULT_COLOR} />;
  }

  return null;
}

/** "#rrggbb" + alfa → rgba(). Si no es un hex válido, cae al color default. */
function hexToRgba(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()) ||
    /^#?([0-9a-f]{6})$/i.exec(RUNWAY_LIGHTS_DEFAULT_COLOR);
  const n = parseInt(m![1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function RunwayLights({ layer, color }: { layer: string; color: string }) {
  // El haz es SOLO degradados, sin blur/clip-path/blend (esa combinación
  // dejaba ver el rectángulo de la caja en algunos navegadores): un cono
  // (conic-gradient centrado en el reflector, apuntando a la derecha = 90deg)
  // con bordes que se funden a transparente, y una máscara que lo apaga a lo
  // largo. La caja es más alta que el cono para que nunca lo corte.
  const beamBg = `conic-gradient(from ${90 - BEAM_HALF_ANGLE}deg at 0% 50%, ${hexToRgba(color, 0)} 0deg, ${hexToRgba(color, 0.12)} ${BEAM_HALF_ANGLE * 0.45}deg, ${hexToRgba(color, 0.55)} ${BEAM_HALF_ANGLE}deg, ${hexToRgba(color, 0.12)} ${BEAM_HALF_ANGLE * 1.55}deg, ${hexToRgba(color, 0)} ${BEAM_HALF_ANGLE * 2}deg, ${hexToRgba(color, 0)} 360deg)`;
  const beamMask = "linear-gradient(to right, black 0%, black 15%, transparent 100%)";
  const sourceGlow = `radial-gradient(circle, ${hexToRgba(color, 1)} 0%, ${hexToRgba(color, 0.55)} 30%, ${hexToRgba(color, 0)} 70%)`;

  const side = (mirrored: boolean) => (
    <div
      className="absolute inset-0"
      // El lado derecho es el izquierdo espejado: el reflector "sale" del
      // borde derecho y barre hacia la izquierda.
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    >
      {RUNWAY_BEAMS.map((b, i) => (
        <React.Fragment key={i}>
          <div
            className="absolute bg-runway-beam"
            style={
              {
                left: 0,
                top: `${b.top}%`,
                width: `${b.length}vw`,
                // tan(11°) ≈ 0.19 → el cono abre ~0.19×largo a cada lado;
                // 0.5×largo de alto por lado sobra.
                height: `${b.length}vw`,
                marginTop: `${-b.length / 2}vw`,
                transformOrigin: "0% 50%",
                background: beamBg,
                maskImage: beamMask,
                WebkitMaskImage: beamMask,
                "--beam-from": `${b.from}deg`,
                "--beam-to": `${b.to}deg`,
                animationDuration: `${b.duration}s`,
                animationDelay: `${mirrored ? b.delay - b.duration / 2 : b.delay}s`,
              } as React.CSSProperties
            }
          />
          <div
            className="absolute rounded-full bg-runway-source"
            style={{
              left: -18,
              top: `${b.top}%`,
              width: 36,
              height: 36,
              marginTop: -18,
              background: sourceGlow,
              animationDelay: `${-i * 0.7}s`,
            }}
          />
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className={`${layer} inset-0 overflow-hidden pointer-events-none`} aria-hidden>
      {side(false)}
      {side(true)}
    </div>
  );
}

function LogoRain({
  layer,
  logos,
  count,
  sizePx,
}: {
  layer: string;
  logos?: string[];
  count?: number;
  sizePx?: number;
}) {
  const n = Math.max(1, Math.min(80, Math.round(count || LOGO_RAIN_DEFAULT_COUNT)));
  const drops = React.useMemo(() => buildRainDrops(n), [n]);
  const valid = (logos || []).filter(Boolean);
  if (valid.length === 0) return null;
  const base = Math.max(20, Math.min(400, sizePx || LOGO_RAIN_DEFAULT_SIZE_PX));

  return (
    <div className={`${layer} inset-0 overflow-hidden pointer-events-none`} aria-hidden>
      {drops.map((d, i) => {
        const size = Math.round(base * d.scale);
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={valid[i % valid.length]}
            alt=""
            draggable={false}
            className="absolute bg-logo-rain object-contain select-none"
            style={
              {
                top: -size,
                left: `${d.left}%`,
                width: size,
                height: size,
                marginLeft: -size / 2,
                opacity: d.opacity,
                "--rain-rot0": `${d.rot0}deg`,
                "--rain-spin": `${d.spin}deg`,
                "--rain-sway": `${d.sway}vw`,
                animationDuration: `${d.duration}s`,
                animationDelay: `${d.delay}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
