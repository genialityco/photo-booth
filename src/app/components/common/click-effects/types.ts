export type ButtonClickEffectId = "NONE" | "CONFETTI" | "PAINT_SPLASH";

export type ButtonClickEffectContext = {
  /** Elemento sobre el que se hizo click (para posicionar el efecto). */
  target: HTMLElement;
};

export type ButtonClickEffectHandler = (ctx: ButtonClickEffectContext) => void;

export type ButtonClickEffectOption = {
  id: ButtonClickEffectId;
  label: string;
};

/** Opciones para poblar selects de configuración (admin). */
export const BUTTON_CLICK_EFFECT_OPTIONS: ButtonClickEffectOption[] = [
  { id: "NONE", label: "Ninguno" },
  { id: "CONFETTI", label: "Confeti" },
  { id: "PAINT_SPLASH", label: "Salpicado de pintura" },
];
