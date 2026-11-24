import type { EventProfile, FacetsLayout } from "@/app/services/photo-booth/eventService";

export type ResultImageEffect = NonNullable<EventProfile["resultImageEffect"]>;

const EFFECTS: ResultImageEffect[] = ["NONE", "SPACE_FLOAT", "GRID_ASSEMBLE"];
const GRIDS: FacetsLayout[] = ["2x1", "3x1", "2x2", "3x2"];

/** Lo que trae el doc de imageTasks: processImageTask escribe
 * `resultImageEffect`/`resultGridLayout` cuando el FILTRO (photo_booth_prompts)
 * define su propio efecto. Sin esos campos, manda el evento. */
type TaskEffectFields = { resultImageEffect?: unknown; resultGridLayout?: unknown } | null | undefined;

/**
 * Efecto de la imagen resultante para ESTA foto: el del filtro (escrito en la
 * tarea) o, si no define uno, el del evento. Así un evento puede tener la
 * "cuadrícula desde el centro" solo en su filtro de facetas y nada en los de
 * imagen simple. En modo ahorro de datos SPACE_FLOAT se apaga igual que en
 * applyLowBandwidth (baja una imagen más).
 */
export function resolveResultImageEffect(
  task: TaskEffectFields,
  event: Pick<EventProfile, "resultImageEffect" | "lowBandwidthMode"> | null | undefined
): ResultImageEffect {
  const fromTask = task?.resultImageEffect;
  const effect = EFFECTS.includes(fromTask as ResultImageEffect)
    ? (fromTask as ResultImageEffect)
    : event?.resultImageEffect ?? "NONE";
  if (event?.lowBandwidthMode && effect === "SPACE_FLOAT") return "NONE";
  return effect;
}

/** Cuadrícula para GRID_ASSEMBLE: la de la tarea (filtro) o la del evento. */
export function resolveResultGridLayout(
  task: TaskEffectFields,
  event: Pick<EventProfile, "resultGridLayout"> | null | undefined
): FacetsLayout | undefined {
  const fromTask = task?.resultGridLayout;
  return GRIDS.includes(fromTask as FacetsLayout) ? (fromTask as FacetsLayout) : event?.resultGridLayout;
}
