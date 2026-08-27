import type { CSSProperties } from "react";

/**
 * Tamaño de las barras de logos (header/footer del wizard y los dos logos de
 * la pantalla de carga).
 *
 * Los logos se dimensionan por ALTO, no por ancho: antes usaban `w-[50vw]` sin
 * ninguna restricción de alto, así que el alto salía de la relación de aspecto
 * de cada archivo — un logo vertical se comía la pantalla, uno apaisado
 * quedaba como una franja fina, y header y footer nunca coincidían entre sí.
 * Con alto fijo + `width:auto` + `object-contain`, cada logo conserva su
 * proporción real y todos ocupan la misma franja vertical.
 */

/** Alto base de los logos del header/footer del wizard.
 *
 * El clamp mezcla vh y vw a propósito: vh es el eje que importa para una barra
 * horizontal (en móvil apaisado hay poco alto y los logos deben encogerse), y
 * el `min(..., 14vw)` evita que en pantallas muy angostas queden
 * desproporcionados respecto al ancho disponible. */
export const LOGO_BAR_HEIGHT = "clamp(1.5rem, min(7vh, 14vw), 4.25rem)";

/** Aire alrededor de las barras de logos. También escalado: valores fijos se
 * comen el alto útil en móvil apaisado y pantallas bajas. */
export const LOGO_BAR_PADDING = "clamp(0.35rem, 1.6vh, 1.25rem)";

/** Alto base de los logos de LoaderStep. Es mayor que el del wizard porque ahí
 * los dos logos van juntos arriba (layout propio de pantalla completa), no uno
 * arriba y otro abajo. */
export const LOADER_LOGO_HEIGHT = "clamp(2.9rem, 8vh, 4.6rem)";

/** Alto/ancho de los logos de LoaderStep en modo `wide` (pantalla gigante) —
 * mismo tratamiento "ancho" que TopLogosBar en modo wide (ancho fijo +
 * object-fill, en vez de solo un tope de ancho con object-contain), para que
 * la pantalla de carga se vea con la misma identidad que la de selección de
 * filtro en vez de quedar angosta en comparación. */
export const LOADER_LOGO_WIDE_HEIGHT = "clamp(4.5rem, 14vh, 8rem)";
export const LOADER_LOGO_WIDE_WIDTH = "24vw";

/** Tope de ancho base del logo superior (uno solo, normalmente la marca). */
export const LOGO_BAR_TOP_MAX_WIDTH = "min(70vw, 300px)";

/** Tope de ancho base del logo inferior. Más holgado que el de arriba porque
 * suele ser una tira con varios logos; al compartir el mismo alto se sigue
 * leyendo como un par con el de arriba en vez de dominarlo. */
export const LOGO_BAR_BOTTOM_MAX_WIDTH = "min(88vw, 420px)";

/** Rango permitido para la escala configurable por evento (`logoTopScalePct` /
 * `logoBottomScalePct`). Acotado para que un valor mal tipeado en el admin no
 * deje un logo invisible ni uno que tape toda la pantalla. */
export const LOGO_SCALE_MIN = 50;
export const LOGO_SCALE_MAX = 250;
export const LOGO_SCALE_DEFAULT = 100;

/** Normaliza la escala configurada. Los eventos sin el campo (o con basura)
 * caen en 100 = el tamaño base de siempre. */
export function clampLogoScale(scalePct?: number | null): number {
  if (typeof scalePct !== "number" || !Number.isFinite(scalePct)) {
    return LOGO_SCALE_DEFAULT;
  }
  return Math.min(LOGO_SCALE_MAX, Math.max(LOGO_SCALE_MIN, scalePct));
}

/**
 * Estilo del `<img>` de un logo: alto base por la escala del evento, con el
 * tope de ancho escalado en la misma proporción.
 *
 * Escalar también el ancho es lo que hace que "agrandar" funcione de verdad:
 * si el `max-width` se quedara en su valor base, `object-contain` frenaría el
 * logo en el ancho viejo y lo dejaría con franjas vacías arriba y abajo en vez
 * de crecer. `viewportMaxWidth` es la red de seguridad para que, por más que
 * se suba la escala, el logo nunca se salga de la pantalla.
 */
export function scaledLogoStyle({
  baseHeight,
  baseMaxWidth,
  scalePct,
  viewportMaxWidth = "92vw",
}: {
  baseHeight: string;
  baseMaxWidth: string;
  scalePct?: number;
  viewportMaxWidth?: string;
}): CSSProperties {
  const k = clampLogoScale(scalePct) / 100;
  return {
    height: `calc(${baseHeight} * ${k})`,
    maxWidth: `min(${viewportMaxWidth}, calc(${baseMaxWidth} * ${k}))`,
  };
}
