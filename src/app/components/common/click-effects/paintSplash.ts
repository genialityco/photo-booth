import type { ButtonClickEffectHandler } from "./types";

const PAINT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const CANVAS_SIZE = 520;
const FADE_MS = 600;

/** Dibuja gotas salpicadas en un radio amplio alrededor del centro, cada una de un color distinto. */
function drawDroplets(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const count = 22 + Math.floor(Math.random() * 12);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = CANVAS_SIZE * 0.06 + Math.random() * CANVAS_SIZE * 0.46;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const r = 3 + Math.random() * 15;
    ctx.fillStyle = PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)];
    ctx.globalAlpha = 0.6 + Math.random() * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

const paintSplashEffect: ButtonClickEffectHandler = ({ target }) => {
  if (typeof document === "undefined") return;

  const rect = target.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  canvas.style.position = "fixed";
  canvas.style.left = `${originX - CANVAS_SIZE / 2}px`;
  canvas.style.top = `${originY - CANVAS_SIZE / 2}px`;
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  canvas.style.opacity = "1";
  canvas.style.transform = "scale(0.8)";
  canvas.style.transition = `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;

  drawDroplets(ctx, cx, cy);

  document.body.appendChild(canvas);

  // Doble rAF para asegurar que el estado inicial se pinte antes de animar.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      canvas.style.opacity = "0";
      canvas.style.transform = "scale(1.15)";
    });
  });

  window.setTimeout(() => canvas.remove(), FADE_MS);
};

export default paintSplashEffect;
