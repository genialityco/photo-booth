import type { ButtonClickEffectHandler } from "./types";

/**
 * "Spray de grafiti": como un aerosol disparado sobre el muro.
 *  1. Nube de spray de un color neón que se va "pintando" en ~0,25 s
 *     (puntitos con distribución gaussiana: núcleo denso, borde que se abre).
 *  2. Chorreados de pintura que bajan desde la mancha.
 *  3. Todo se desvanece y se limpia solo.
 * Canvas + Web Animations API, sin CSS global. Con prefers-reduced-motion
 * solo queda la mancha, que se desvanece (sin pintado progresivo ni chorreados).
 */

const SPRAY_COLORS = ["#22d3ee", "#f472b6", "#facc15", "#a3e635", "#c084fc"];
const CANVAS_SIZE = 440;
const SPRAY_MS = 240;
const HOLD_MS = 700;
const FADE_MS = 550;

/** Normal estándar (Box-Muller). */
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sprayDots(ctx: CanvasRenderingContext2D, color: string, count: number, sigma: number) {
  const c = CANVAS_SIZE / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = c + gaussian() * sigma;
    const y = c + gaussian() * sigma * 0.85;
    ctx.globalAlpha = 0.18 + Math.random() * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + Math.random() * 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

const sprayTagEffect: ButtonClickEffectHandler = ({ target }) => {
  if (typeof document === "undefined") return;

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const color = SPRAY_COLORS[Math.floor(Math.random() * SPRAY_COLORS.length)];
  // Más ancha la nube cuanto más grande el botón (con tope).
  const sigma = Math.min(70, Math.max(32, Math.max(rect.width, rect.height) * 0.28));

  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "9999",
    overflow: "hidden",
  });
  document.body.appendChild(root);

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  Object.assign(canvas.style, {
    position: "absolute",
    left: `${cx - CANVAS_SIZE / 2}px`,
    top: `${cy - CANVAS_SIZE / 2}px`,
    // El brillo de neón de la pintura.
    filter: `drop-shadow(0 0 6px ${color})`,
  });
  root.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    root.remove();
    return;
  }

  if (reduceMotion) {
    sprayDots(ctx, color, 900, sigma * 0.55);
    sprayDots(ctx, color, 500, sigma);
  } else {
    // 1. Pintado progresivo: cada cuadro suma puntos, primero el núcleo.
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SPRAY_MS);
      sprayDots(ctx, color, 160, sigma * (0.4 + t * 0.35));
      sprayDots(ctx, color, 90, sigma * (0.8 + t * 0.4));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    // 2. Chorreados: salen de la parte baja de la mancha y bajan.
    const drips = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < drips; i++) {
      // Repartidos en franjas a lo ancho de la mancha (si no, se juntan
      // y parecen un solo chorro grueso).
      const x = cx + ((i + 0.2 + Math.random() * 0.6) / drips - 0.5) * sigma * 2.6;
      const y = cy + sigma * (0.15 + Math.random() * 0.35);
      const w = 4 + Math.random() * 4;
      const len = 50 + Math.random() * 90;
      const drip = document.createElement("div");
      Object.assign(drip.style, {
        position: "absolute",
        left: `${x - w / 2}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${len}px`,
        borderRadius: `0 0 ${w}px ${w}px`,
        background: `linear-gradient(to bottom, ${color}00 0%, ${color} 18%, ${color} 100%)`,
        boxShadow: `0 0 6px ${color}`,
        transformOrigin: "top center",
      });
      root.appendChild(drip);
      // fill "both": durante el delay ya aplica scaleY(0) (sin estilo inline).
      drip.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], {
        duration: 650 + Math.random() * 500,
        delay: SPRAY_MS * 0.6 + Math.random() * 180,
        easing: "cubic-bezier(.3, .7, .4, 1)",
        fill: "both",
      });
    }
  }

  // 3. Se desvanece todo.
  root.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: FADE_MS,
    delay: reduceMotion ? 250 : SPRAY_MS + HOLD_MS,
    easing: "ease-in",
    fill: "forwards",
  });
  window.setTimeout(() => root.remove(), (reduceMotion ? 250 : SPRAY_MS + HOLD_MS) + FADE_MS + 50);
};

export default sprayTagEffect;
