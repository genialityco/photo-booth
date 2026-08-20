// Relación de aspecto de la foto capturada/generada, configurable por evento
// (EventProfile.photoAspectRatio). "SQUARE" (o sin configurar) es el
// comportamiento original de toda la app. "3:4" existe para imprimir en una
// Canon Selphy CP1500 — se usa en captura (CaptureStep/FrameCamera), en el
// compuesto final (composeFramedImage) y en las pantallas de revelado
// (useRevealVeil), para que la foto capturada, la enviada a la IA, la
// revelada y la impresa sean siempre la misma forma.

export type PhotoAspectRatio = "SQUARE" | "3:4";

export const ASPECT_RATIO_DIMS: Record<PhotoAspectRatio, { w: number; h: number }> = {
  SQUARE: { w: 1, h: 1 },
  "3:4": { w: 3, h: 4 },
};

export function getAspectDims(ratio?: PhotoAspectRatio | null): { w: number; h: number } {
  return ASPECT_RATIO_DIMS[ratio ?? "SQUARE"] ?? ASPECT_RATIO_DIMS.SQUARE;
}

/** Clase Tailwind para una caja que respeta esta relación de aspecto. */
export function getAspectClassName(ratio?: PhotoAspectRatio | null): string {
  return ratio === "3:4" ? "aspect-[3/4]" : "aspect-square";
}

/**
 * Dimensiones en píxeles para un canvas/composición, manteniendo el lado
 * mayor en `baseSize` (por defecto 1024, el tamaño cuadrado original).
 */
export function getPixelDims(ratio: PhotoAspectRatio | undefined | null, baseSize = 1024): { width: number; height: number } {
  const { w, h } = getAspectDims(ratio);
  if (w >= h) return { width: baseSize, height: Math.round((baseSize * h) / w) };
  return { width: Math.round((baseSize * w) / h), height: baseSize };
}

/**
 * `width` (con `aspect-*` CSS derivando el alto) para las cajas de foto de
 * RevealStep/RollerRevealStep: acota por ancho de viewport Y por alto de
 * viewport, igual que el clamp original `min(70vw, 60svh)` pero ajustando
 * el término de alto según la relación de aspecto (para formas más altas
 * que anchas como 3:4, el ancho debe acotarse más para no desbordar
 * verticalmente).
 */
export function getRevealBoxWidthCss(ratio?: PhotoAspectRatio | null): string {
  const { w, h } = getAspectDims(ratio);
  if (w === h) return "clamp(300px, min(70vw, 60svh), 700px)";
  return `clamp(300px, min(70vw, calc(60svh * ${w} / ${h})), 700px)`;
}
