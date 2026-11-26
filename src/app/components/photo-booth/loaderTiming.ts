import type { EventProfile } from "@/app/services/photo-booth/eventService";
import type { BrandGenerationType } from "@/app/services/photo-booth/brandService";

/**
 * Tiempos del anillo de progreso de LoaderStep.
 *
 * El backend no reporta progreso real (el doc de imageTasks pasa de "queued" a
 * "done" sin pasos intermedios), así que el % es simulado contra una duración
 * estimada. Esa duración depende de QUÉ se genera:
 *  - IMAGE: una imagen ~1K de Gemini.
 *  - FACETS: una cuadrícula en 4K (FACETS_IMAGE_SIZES en functions/src/index.ts)
 *    que después se corta con sharp y se sube pieza por pieza — bastante más lenta.
 *  - MULTI_PROMPT: varias imágenes en paralelo + collage (manda la más lenta).
 *  - VIDEO: imagen + compositing de video externo (BGVIDEO/VIDEO).
 *
 * Los valores por defecto se corrigen solos: cada generación terminada guarda
 * su duración real (lo que el asistente vio en pantalla, subida incluida) en
 * localStorage, y la estimación pasa a ser un promedio móvil de esas
 * mediciones por tipo — así se ajusta a la red y a la latencia de cada sede.
 */
export type GenerationKind = "IMAGE" | "FACETS" | "MULTI_PROMPT" | "VIDEO";

const DEFAULT_DURATION_MS: Record<GenerationKind, number> = {
  IMAGE: 18000,
  FACETS: 40000,
  MULTI_PROMPT: 30000,
  VIDEO: 45000,
};

const STORAGE_PREFIX = "loaderDurationMs:";
/** Peso de la última medición en el promedio móvil. */
const EMA_ALPHA = 0.3;
/** Límites de la estimación aprendida, relativos al default del tipo — evita
 * que una medición absurda (pestaña en segundo plano, red caída) la rompa. */
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 3;

/** Hasta dónde sube el anillo al cumplirse la duración estimada. */
export const PROGRESS_AT_ESTIMATE = 90;
/** Tope absoluto: nunca llega a 100 antes de que la imagen esté lista (el
 * wizard desmonta el loader apenas Firestore marca "done"). */
export const PROGRESS_CAP = 97;

/** Tipo de generación esperado, con la misma prioridad que processImageTask:
 * flujo multi-prompt > tipo del filtro > tipo del evento. */
export function resolveGenerationKind(
  event: EventProfile | null | undefined,
  brandGenerationType?: BrandGenerationType | null
): GenerationKind {
  if (event?.boothFlow === "MULTI_PROMPT") return "MULTI_PROMPT";
  const type = brandGenerationType || event?.generationType || "IMAGE";
  if (type === "FACETS") return "FACETS";
  if (type === "BGVIDEO" || type === "VIDEO") return "VIDEO";
  return "IMAGE";
}

/** Tipo de una tarea ya terminada, leído del propio doc de imageTasks (lo
 * que de verdad se generó, por si el filtro cambió entre medio). */
export function generationKindFromTask(task: Record<string, unknown>): GenerationKind {
  if (task.flow === "MULTI_PROMPT") return "MULTI_PROMPT";
  if (task.videoUrl) return "VIDEO";
  // processImageTask escribe facetsLayout en ambas salidas de facetas
  // (carrusel y cuadrícula GRID_ASSEMBLE).
  if (task.facetsLayout) return "FACETS";
  return "IMAGE";
}

const clampForKind = (kind: GenerationKind, ms: number) => {
  const base = DEFAULT_DURATION_MS[kind];
  return Math.min(base * MAX_FACTOR, Math.max(base * MIN_FACTOR, ms));
};

export function estimatedDurationMs(kind: GenerationKind): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_PREFIX + kind));
    if (Number.isFinite(stored) && stored > 0) return clampForKind(kind, stored);
  } catch {
    // localStorage no disponible: se usa el default
  }
  return DEFAULT_DURATION_MS[kind];
}

export function recordGenerationDuration(kind: GenerationKind, ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  try {
    const sample = clampForKind(kind, ms);
    const prev = Number(localStorage.getItem(STORAGE_PREFIX + kind));
    const next =
      Number.isFinite(prev) && prev > 0 ? prev + EMA_ALPHA * (sample - prev) : sample;
    localStorage.setItem(STORAGE_PREFIX + kind, String(Math.round(next)));
  } catch {
    // sin persistencia: no pasa nada, se sigue con el default
  }
}

/** % simulado: sube lineal hasta PROGRESS_AT_ESTIMATE en `durationMs` y, si la
 * generación tarda más, sigue avanzando cada vez más despacio hacia
 * PROGRESS_CAP en vez de quedarse clavado. */
export function simulatedProgress(elapsedMs: number, durationMs: number): number {
  if (elapsedMs <= durationMs) {
    return Math.round((elapsedMs / durationMs) * PROGRESS_AT_ESTIMATE);
  }
  const over = (elapsedMs - durationMs) / durationMs;
  return Math.round(
    PROGRESS_AT_ESTIMATE + (PROGRESS_CAP - PROGRESS_AT_ESTIMATE) * (1 - Math.exp(-over * 1.5))
  );
}
