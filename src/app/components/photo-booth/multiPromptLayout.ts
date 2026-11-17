/**
 * Distribuciones del collage del flujo multi-prompt (event.boothFlow ===
 * "MULTI_PROMPT"): una foto por cada prompt del evento (1 a 4), ubicadas según
 * la distribución elegida en el admin. El orden de las fotos es el orden de
 * `event.prompts`: la foto del prompt N va en la celda N.
 *
 * Las celdas se miden en "unidades de foto" (1 unidad = una foto con la
 * relación de aspecto del evento), así una celda grande de 2x2 sigue teniendo
 * la forma de la foto. La misma tabla está copiada en functions/src/index.ts
 * (MULTI_PROMPT_LAYOUTS), que es donde se arma el collage real que baja el QR —
 * si se cambia acá, cambiarla allá también.
 */

export type MultiPromptLayoutId = "single" | "row" | "column" | "grid" | "big-left" | "big-top";

export type MultiPromptCell = { x: number; y: number; w: number; h: number };

export type MultiPromptLayout = {
  id: MultiPromptLayoutId;
  label: string;
  cols: number;
  rows: number;
  cells: MultiPromptCell[];
};

/** Máximo de prompts que genera el flujo: con más, se usan los primeros 4. */
export const MULTI_PROMPT_MAX = 4;

/** Separación entre fotos (y margen exterior), en % del ancho de una foto. */
export const MULTI_PROMPT_GAP_DEFAULT = 3;
export const MULTI_PROMPT_GAP_MAX = 10;
export const MULTI_PROMPT_BG_DEFAULT = "#ffffff";
/** Segundos que se ve cada foto en la animación previa al resultado. */
export const MULTI_PROMPT_SHOWCASE_SECONDS_DEFAULT = 2.5;

/**
 * Cómo entran las fotos a la pantalla de resultado (tablet y pantalla espejo).
 * Solo es la animación en pantalla: no cambia el collage que baja el QR.
 * - "POP": aparecen casi a la vez, cada una en su lugar (la de siempre).
 * - "CENTER_OUT": una por una, cada foto aparece grande en el centro y viaja
 *   hacia afuera a su celda; al terminar la última queda armada la cuadrícula.
 */
export type MultiPromptResultEffect = "POP" | "CENTER_OUT";
export const MULTI_PROMPT_RESULT_EFFECT_DEFAULT: MultiPromptResultEffect = "POP";
export const MULTI_PROMPT_RESULT_EFFECTS: { id: MultiPromptResultEffect; label: string; description: string }[] = [
  {
    id: "POP",
    label: "Aparecen juntas",
    description: "Todas las fotos aparecen casi a la vez, cada una en su lugar.",
  },
  {
    id: "CENTER_OUT",
    label: "Desde el centro, una por una",
    description: "Cada foto aparece grande en el centro y viaja a su lugar; al final queda armada la cuadrícula.",
  },
];
/**
 * CENTER_OUT con UNA sola foto (un solo prompt que ya devuelve una imagen con
 * varios paneles, ej. 4 facetas en 2x2): en pantalla esa imagen se divide en
 * columnas x filas (por las mitades, tercios…) y cada pieza hace el viaje del
 * centro a su lugar por separado (GridAssembleImage). "NONE" = no dividir.
 * Solo visual: el collage/QR sigue siendo la imagen entera.
 */
export type MultiPromptSplitGrid = "NONE" | "2x2" | "2x1" | "1x2" | "3x1" | "3x2";
export const MULTI_PROMPT_SPLIT_DEFAULT: MultiPromptSplitGrid = "2x2";
export const MULTI_PROMPT_SPLIT_OPTIONS: { id: MultiPromptSplitGrid; label: string }[] = [
  { id: "2x2", label: "4 partes (2 × 2, por las mitades)" },
  { id: "2x1", label: "2 partes lado a lado (2 × 1)" },
  { id: "1x2", label: "2 partes una sobre otra (1 × 2)" },
  { id: "3x1", label: "3 partes lado a lado (3 × 1)" },
  { id: "3x2", label: "6 partes (3 × 2)" },
  { id: "NONE", label: "No dividir" },
];
/** La cuadrícula en que se divide la foto en pantalla, o null si no se
 * divide (más de una foto, otro efecto, o "NONE"). */
export function resolveSplitGrid(
  photoCount: number,
  effect: MultiPromptResultEffect | undefined,
  split: MultiPromptSplitGrid | undefined
): Exclude<MultiPromptSplitGrid, "NONE"> | null {
  if (photoCount !== 1 || effect !== "CENTER_OUT") return null;
  const value = split ?? MULTI_PROMPT_SPLIT_DEFAULT;
  return value === "NONE" ? null : value;
}

/** CENTER_OUT: ms entre la entrada de una foto y la siguiente. */
export const CENTER_OUT_STAGGER_MS = 1100;
/** CENTER_OUT: ms que dura cada foto (aparecer en el centro + pausa + viaje). */
export const CENTER_OUT_DURATION_MS = 1700;
/** CENTER_OUT: ms hasta que la última foto queda en su lugar. */
export function centerOutTotalMs(count: number): number {
  return count <= 0 ? 0 : (count - 1) * CENTER_OUT_STAGGER_MS + CENTER_OUT_DURATION_MS;
}

const cell = (x: number, y: number, w = 1, h = 1): MultiPromptCell => ({ x, y, w, h });

export const MULTI_PROMPT_LAYOUTS: Record<1 | 2 | 3 | 4, MultiPromptLayout[]> = {
  1: [{ id: "single", label: "Una sola foto", cols: 1, rows: 1, cells: [cell(0, 0)] }],
  2: [
    { id: "row", label: "Lado a lado", cols: 2, rows: 1, cells: [cell(0, 0), cell(1, 0)] },
    { id: "column", label: "Una sobre otra", cols: 1, rows: 2, cells: [cell(0, 0), cell(0, 1)] },
  ],
  3: [
    { id: "row", label: "En fila", cols: 3, rows: 1, cells: [cell(0, 0), cell(1, 0), cell(2, 0)] },
    { id: "column", label: "En columna", cols: 1, rows: 3, cells: [cell(0, 0), cell(0, 1), cell(0, 2)] },
    { id: "big-left", label: "Grande a la izquierda", cols: 3, rows: 2, cells: [cell(0, 0, 2, 2), cell(2, 0), cell(2, 1)] },
    { id: "big-top", label: "Grande arriba", cols: 2, rows: 3, cells: [cell(0, 0, 2, 2), cell(0, 2), cell(1, 2)] },
  ],
  4: [
    { id: "grid", label: "Cuadrícula 2×2", cols: 2, rows: 2, cells: [cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)] },
    { id: "row", label: "En fila", cols: 4, rows: 1, cells: [cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)] },
    { id: "column", label: "En columna", cols: 1, rows: 4, cells: [cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3)] },
    { id: "big-left", label: "Grande a la izquierda", cols: 4, rows: 3, cells: [cell(0, 0, 3, 3), cell(3, 0), cell(3, 1), cell(3, 2)] },
    { id: "big-top", label: "Grande arriba", cols: 3, rows: 4, cells: [cell(0, 0, 3, 3), cell(0, 3), cell(1, 3), cell(2, 3)] },
  ],
};

function clampCount(count: number): 1 | 2 | 3 | 4 {
  return Math.max(1, Math.min(MULTI_PROMPT_MAX, Math.round(count) || 1)) as 1 | 2 | 3 | 4;
}

export function layoutsForCount(count: number): MultiPromptLayout[] {
  return MULTI_PROMPT_LAYOUTS[clampCount(count)];
}

/** La distribución elegida si existe para esa cantidad de fotos; si no (ej.
 * se eligió "grande arriba" con 3 prompts y después se sacó uno), la primera
 * de la lista, que es la default de cada cantidad. */
export function resolveMultiPromptLayout(count: number, id?: string | null): MultiPromptLayout {
  const options = layoutsForCount(count);
  return options.find((l) => l.id === id) ?? options[0];
}

/**
 * Geometría del collage en proporciones (0..1 del lienzo), para dibujarlo con
 * CSS. `tileRatio` = ancho/alto de una foto; `gapPct` = separación en % del
 * ancho de una foto (también es el margen exterior).
 */
export function layoutGeometry(layout: MultiPromptLayout, tileRatio: number, gapPct: number) {
  const tw = 1;
  const th = 1 / tileRatio;
  const g = Math.max(0, gapPct) / 100;
  const width = 2 * g + layout.cols * tw + (layout.cols - 1) * g;
  const height = 2 * g + layout.rows * th + (layout.rows - 1) * g;
  const cells = layout.cells.map((c) => ({
    left: (g + c.x * (tw + g)) / width,
    top: (g + c.y * (th + g)) / height,
    width: (c.w * tw + (c.w - 1) * g) / width,
    height: (c.h * th + (c.h - 1) * g) / height,
  }));
  return { ratio: width / height, cells };
}
