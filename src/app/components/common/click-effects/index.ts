import confettiEffect from "./confetti";
import paintSplashEffect from "./paintSplash";
import runwayFlashEffect from "./runwayFlash";
import sprayTagEffect from "./sprayTag";
import type {
  ButtonClickEffectContext,
  ButtonClickEffectHandler,
  ButtonClickEffectId,
} from "./types";

export type { ButtonClickEffectId } from "./types";
export { BUTTON_CLICK_EFFECT_OPTIONS } from "./types";

// Para agregar un nuevo efecto: crear su archivo (ej. ripple.ts), registrarlo
// aquí y sumar la opción en BUTTON_CLICK_EFFECT_OPTIONS (types.ts).
const REGISTRY: Partial<Record<ButtonClickEffectId, ButtonClickEffectHandler>> = {
  CONFETTI: confettiEffect,
  PAINT_SPLASH: paintSplashEffect,
  RUNWAY_FLASH: runwayFlashEffect,
  SPRAY_TAG: sprayTagEffect,
};

export function runButtonClickEffect(
  id: ButtonClickEffectId | undefined | null,
  ctx: ButtonClickEffectContext
): void {
  if (!id || id === "NONE") return;
  const handler = REGISTRY[id];
  handler?.(ctx);
}
