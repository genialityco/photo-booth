import type { CSSProperties } from "react";

/**
 * "Subir botones" (`event.buttonsLiftPct`): cuánto se suben las filas de
 * botones del booth, en % del alto de la pantalla. Aplica a la selección de
 * marca (botón de inicio), preview, personalización y resultado (clásico y
 * multi-prompt). La splash tiene su propio editor de posiciones y no se ve
 * afectada. Sin valor o 0 = la posición de siempre.
 *
 * Se aplica como `margin-bottom` en la fila de botones, que en todas esas
 * pantallas es el último hijo `flex-shrink-0` de una columna flex: el margen
 * la empuja hacia arriba y el contenido de arriba (foto, tarjetas) cede ese
 * alto, sin superponerse.
 */
export const BUTTONS_LIFT_MAX_PCT = 30;

export function clampButtonsLift(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(BUTTONS_LIFT_MAX_PCT, n));
}

export function buttonsLiftStyle(value: unknown): CSSProperties | undefined {
  const pct = clampButtonsLift(value);
  return pct > 0 ? { marginBottom: `${pct}dvh` } : undefined;
}

/**
 * "Mover la imagen del resultado" (`event.resultImageOffsetPct`): desplaza
 * verticalmente la foto generada en la pantalla de resultado de la tablet
 * (ResultStep y MultiPromptResultStep), en % del alto de la pantalla.
 * Positivo = sube, negativo = baja; sin valor o 0 = posición de siempre.
 *
 * Es un `translateY` (no cambia el tamaño de la foto ni el layout): puede
 * quedar encima de los logos o los botones, por eso la fila de botones del
 * resultado va con z-index por encima de la foto, para que siempre se pueda
 * tocar.
 */
export const RESULT_IMAGE_OFFSET_MAX_PCT = 30;

export function clampResultImageOffset(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(-RESULT_IMAGE_OFFSET_MAX_PCT, Math.min(RESULT_IMAGE_OFFSET_MAX_PCT, n));
}

export function resultImageOffsetStyle(value: unknown): CSSProperties | undefined {
  const pct = clampResultImageOffset(value);
  return pct !== 0 ? { transform: `translateY(${-pct}dvh)` } : undefined;
}
