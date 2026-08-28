import type { Variants } from "framer-motion";

/**
 * Transiciones entre pasos del wizard (`PhotoBoothWizard`).
 *
 * La idea es que cada paso tenga su propia "personalidad" de entrada/salida en
 * vez de un crossfade único para todos: el recorrido se lee como una secuencia
 * (elijo filtro → se abre la cámara → cae la foto → se procesa → aparece el
 * resultado) y no como siete pantallas intercambiables.
 *
 * Dos reglas que conviene respetar al tocar esto:
 *
 * 1) Solo `opacity` + transforms (`x`/`y`/`scale`/`rotate`). Son las dos
 *    propiedades que el navegador puede componer en GPU sin repintar, que es
 *    lo que sostiene los 60fps en las tablets/kioscos donde corre el booth.
 *    Evitar `filter: blur()` a pantalla completa: se ve lindo en el monitor de
 *    desarrollo y se arrastra en el hardware real.
 *
 * 2) Los pasos NO se turnan (`AnimatePresence` sin `mode="wait"`): el que sale
 *    y el que entra conviven superpuestos y se cruzan. Por eso las salidas son
 *    más cortas que las entradas — el paso viejo se aparta mientras el nuevo
 *    todavía está llegando, y nunca queda un hueco de contenedor vacío.
 *
 * Un paso a pantalla completa (`filter`, `capture`, `loading`) tiene que
 * animarse dentro de un wrapper `fixed inset-0`: el transform de la animación
 * crea un containing block, así que un hijo `fixed inset-0` se ancla al
 * wrapper. Si el wrapper ya cubre el viewport el recorte coincide y no se nota;
 * si el wrapper fuera una caja chica, el paso saltaría de tamaño al terminar.
 */

export type WizardStepName =
  | "filter"
  | "capture"
  | "preview"
  | "customize"
  | "loading"
  | "reveal"
  | "result";

// Salida exponencial: arranca rápido y frena largo. Es la que da la sensación
// de "fluido" en las entradas, porque el elemento llega antes de lo que el ojo
// espera y después se acomoda.
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
// Entrada acelerada para las salidas: el paso que se va se aparta rápido en
// vez de quedar flotando a media opacidad encima del que entra.
const EASE_IN: [number, number, number, number] = [0.55, 0, 1, 0.45];

// Asentamiento sin rebote visible: para la foto que "cae" en el preview.
const SPRING_SETTLE = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
// Con un pelín de sobrepaso: el resultado es el premio del recorrido y se
// permite ese golpe de energía al aparecer.
const SPRING_POP = { type: "spring", stiffness: 300, damping: 22, mass: 0.8 } as const;

// El paso que sale sigue montado durante el cruce: se le desactivan los
// eventos para que no se pueda tocar un botón que ya está desapareciendo.
const LEAVING = { pointerEvents: "none" as const };
const ACTIVE = { pointerEvents: "auto" as const };

export const STEP_VARIANTS: Record<WizardStepName, Variants> = {
  // Selección de prompt: el panel se asienta desde abajo al entrar y se va
  // hacia arriba al salir, como si se levantara para dejar ver la cámara.
  filter: {
    initial: { opacity: 0, y: 28, scale: 0.985 },
    animate: { ...ACTIVE, opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } },
    exit: { ...LEAVING, opacity: 0, y: -24, scale: 1.03, transition: { duration: 0.32, ease: EASE_IN } },
  },

  // Cámara: apertura de lente. Entra desde un poco más grande y se acomoda
  // (como un objetivo enfocando); al salir sigue creciendo mientras se
  // desvanece, que se lee como "la cámara se acerca y suelta la foto".
  capture: {
    initial: { opacity: 0, scale: 1.08 },
    animate: { ...ACTIVE, opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } },
    exit: { ...LEAVING, opacity: 0, scale: 1.05, transition: { duration: 0.3, ease: EASE_IN } },
  },

  // Preview: la foto recién tomada "cae" y se asienta, tipo polaroid. Es el
  // único paso con rotación — el gesto físico refuerza que eso es un objeto
  // (la foto) y no una pantalla más.
  preview: {
    initial: { opacity: 0, scale: 0.88, y: 34, rotate: -2.5 },
    animate: { ...ACTIVE, opacity: 1, scale: 1, y: 0, rotate: 0, transition: SPRING_SETTLE },
    exit: { ...LEAVING, opacity: 0, scale: 0.94, y: -28, rotate: 1.5, transition: { duration: 0.3, ease: EASE_IN } },
  },

  // Personalización: avance lateral. Marca que es un paso *dentro* del mismo
  // hilo (la misma foto, otra pantalla) y no un salto de etapa.
  customize: {
    initial: { opacity: 0, x: 48, scale: 0.98 },
    animate: { ...ACTIVE, opacity: 1, x: 0, scale: 1, transition: { duration: 0.42, ease: EASE_OUT } },
    exit: { ...LEAVING, opacity: 0, x: -44, scale: 0.98, transition: { duration: 0.3, ease: EASE_IN } },
  },

  // Loading: entra expandiéndose sobre todo lo demás y sale colapsando hacia
  // adentro, como si se cerrara sobre el resultado que está por aparecer.
  loading: {
    initial: { opacity: 0, scale: 1.06 },
    animate: { ...ACTIVE, opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } },
    exit: { ...LEAVING, opacity: 0, scale: 0.92, transition: { duration: 0.4, ease: EASE_IN } },
  },

  // Reveal: deliberadamente sobrio. El efecto acá es el revelado en sí
  // (mano/rodillo); una transición marcada le competiría y ensuciaría el
  // arranque de la animación de revelado.
  reveal: {
    initial: { opacity: 0, scale: 1.03 },
    animate: { ...ACTIVE, opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } },
    exit: { ...LEAVING, opacity: 0, scale: 0.985, transition: { duration: 0.35, ease: EASE_IN } },
  },

  // Resultado: pop con sobrepaso. Es el momento de recompensa del recorrido.
  result: {
    initial: { opacity: 0, scale: 0.9, y: 26 },
    animate: { ...ACTIVE, opacity: 1, scale: 1, y: 0, transition: SPRING_POP },
    exit: { ...LEAVING, opacity: 0, scale: 0.96, y: -20, transition: { duration: 0.3, ease: EASE_IN } },
  },
};

// `prefers-reduced-motion`: no se cancela la transición (el corte seco entre
// pasos se lee peor, no mejor), se degrada a un crossfade puro sin transforms.
export const REDUCED_MOTION_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { ...ACTIVE, opacity: 1, transition: { duration: 0.25, ease: "linear" } },
  exit: { ...LEAVING, opacity: 0, transition: { duration: 0.2, ease: "linear" } },
};

/** Variants del paso, ya resueltas según `prefers-reduced-motion`. */
export function stepVariantsFor(step: WizardStepName, reduceMotion: boolean | null): Variants {
  return reduceMotion ? REDUCED_MOTION_VARIANTS : STEP_VARIANTS[step];
}

/** Crossfade suave para las barras de logo, que aparecen/desaparecen según el paso. */
export const LOGO_BAR_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.35, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.25, ease: EASE_IN } },
};
