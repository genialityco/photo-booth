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
