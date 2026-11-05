import type { ButtonClickEffectHandler } from "./types";

/**
 * "Flash de pasarela": como los fotógrafos al borde de la pasarela.
 *  1. Destello blanco que se expande desde el botón.
 *  2. Parpadeo blanco suave de toda la pantalla (el "flash" de cámara).
 *  3. Varios flashes con forma de estrella de 4 puntas que estallan
 *     alrededor del botón, escalonados, como cámaras disparando.
 * Todo con DOM + Web Animations API, sin CSS global; se limpia solo.
 * Con prefers-reduced-motion solo queda un destello corto en el botón (sin
 * parpadeo de pantalla ni estrellas).
 */

const STAR_CLIP =
  "polygon(50% 0%, 57% 43%, 100% 50%, 57% 57%, 50% 100%, 43% 57%, 0% 50%, 43% 43%)";

const TOTAL_MS = 1000;

function el(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, { position: "absolute", pointerEvents: "none" }, style);
  return d;
}

const runwayFlashEffect: ButtonClickEffectHandler = ({ target }) => {
  if (typeof document === "undefined") return;

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "9999",
    overflow: "hidden",
  });
  document.body.appendChild(root);

  // 1. Destello en el botón.
  const burstSize = Math.max(rect.width, rect.height) * 2.2;
  const burst = el({
    left: `${cx - burstSize / 2}px`,
    top: `${cy - burstSize / 2}px`,
    width: `${burstSize}px`,
    height: `${burstSize}px`,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 30%, rgba(255,255,255,0) 70%)",
  });
  root.appendChild(burst);
  burst.animate(
    [
      { opacity: 0, transform: "scale(0.4)" },
      { opacity: 1, transform: "scale(1)", offset: 0.25 },
      { opacity: 0, transform: "scale(1.5)" },
    ],
    { duration: reduceMotion ? 300 : 500, easing: "ease-out", fill: "forwards" }
  );

  if (!reduceMotion) {
    // 2. Parpadeo de pantalla: suave (máx 0.35) y muy corto.
    const screen = el({ inset: "0", background: "#fff" });
    root.appendChild(screen);
    screen.animate(
      [{ opacity: 0 }, { opacity: 0.35, offset: 0.15 }, { opacity: 0 }],
      { duration: 280, easing: "ease-out", fill: "forwards" }
    );

    // 3. Flashes de fotógrafos alrededor, en un anillo con algo de azar.
    const count = 7;
    const minR = Math.max(rect.width, rect.height) * 0.7 + 30;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      const dist = minR + Math.random() * 140;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const size = 34 + Math.random() * 34;
      const delay = 60 + Math.random() * 520;
      const rot = Math.random() * 45;

      const glow = el({
        left: `${x - size}px`,
        top: `${y - size}px`,
        width: `${size * 2}px`,
        height: `${size * 2}px`,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(210,230,255,0.35) 35%, rgba(255,255,255,0) 70%)",
        opacity: "0",
      });
      const star = el({
        left: `${x - size / 2}px`,
        top: `${y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        background: "#fff",
        clipPath: STAR_CLIP,
        opacity: "0",
      });
      root.appendChild(glow);
      root.appendChild(star);

      const timing: KeyframeAnimationOptions = {
        duration: 260,
        delay,
        easing: "ease-out",
        fill: "forwards",
      };
      glow.animate(
        [
          { opacity: 0, transform: "scale(0.3)" },
          { opacity: 1, transform: "scale(1)", offset: 0.3 },
          { opacity: 0, transform: "scale(1.2)" },
        ],
        timing
      );
      star.animate(
        [
          { opacity: 0, transform: `rotate(${rot}deg) scale(0.2)` },
          { opacity: 1, transform: `rotate(${rot + 10}deg) scale(1.1)`, offset: 0.3 },
          { opacity: 0, transform: `rotate(${rot + 25}deg) scale(0.6)` },
        ],
        timing
      );
    }
  }

  window.setTimeout(() => root.remove(), TOTAL_MS);
};

export default runwayFlashEffect;
