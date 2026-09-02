import type { EventProfile } from "@/app/services/photo-booth/eventService";

/**
 * "Modo ahorro de datos": una sola perilla para eventos con wifi malo.
 *
 * La idea central es no hacer que veinte componentes lean un flag nuevo, sino
 * derivar un `EventProfile` con las funciones caras ya apagadas
 * (`applyLowBandwidth`) y pasar ESE evento hacia abajo. Todo lo que ya lee
 * `event.revealEffect`, `event.handCursorEnabled`, etc. queda cubierto sin
 * tocarlo.
 *
 * Vale distinguir dos costos que se suelen confundir, porque el modo ataca
 * los dos pero por razones distintas:
 *  - RED: los modelos WASM/ONNX del revelado con rodillo (~49 MB entre
 *    onnxruntime y best.onnx) y MediaPipe para las manos (~20 MB), que se
 *    descargan EN MEDIO de la sesión y compiten con la subida de la foto;
 *    más los videos de fondo/salvapantallas y el peso de la foto que sube.
 *  - CPU/GPU del dispositivo: animaciones, confeti, fondo animado. Eso no
 *    gasta red, pero en las tablets baratas de kiosco es lo que hace que
 *    todo se sienta trabado, así que también se apaga acá.
 */

/** Clave de sessionStorage con la preferencia elegida en la propia pantalla
 * (el botón discreto del booth). Es por tab, igual que el resto de la
 * configuración efímera del kiosco. */
export const LOW_BANDWIDTH_STORAGE_KEY = "lowBandwidthMode";

/** Query param para forzar el modo sin pasar por el admin ni por el botón,
 * pensado para dejarlo fijo en la URL del kiosco: `?lite=1` / `?lite=0`. */
export const LOW_BANDWIDTH_QUERY_PARAM = "lite";

export type CaptureQuality = {
  /** Lado largo máximo del JPEG que se sube. 0 = sin límite (se respeta el
   * tamaño nativo del marco, que es el comportamiento normal). */
  maxSide: number;
  /** Calidad JPEG de `canvas.toDataURL`. */
  quality: number;
};

/** Captura normal: tamaño nativo del marco, q0.9. */
export const CAPTURE_NORMAL: CaptureQuality = { maxSide: 0, quality: 0.9 };

/** Captura en modo ahorro: 1080 px de lado largo alcanza de sobra para lo que
 * la IA recibe de entrada, y baja el POST de ~450 KB a ~150 KB. */
export const CAPTURE_LOW_BANDWIDTH: CaptureQuality = { maxSide: 1080, quality: 0.72 };

/** La copia sin marco que se sube SOLO para que la pantalla espejo muestre
 * algo mientras el asistente confirma. Nunca se imprime ni se le pasa a la
 * IA, así que subirla a resolución completa era duplicar los bytes en el peor
 * momento posible. */
export const PREVIEW_UPLOAD_NORMAL: CaptureQuality = { maxSide: 1080, quality: 0.7 };
export const PREVIEW_UPLOAD_LOW_BANDWIDTH: CaptureQuality = { maxSide: 480, quality: 0.45 };

/**
 * Resuelve si el modo va activado, en orden de prioridad:
 *   1. `?lite=1` / `?lite=0` en la URL (override del operador en sitio),
 *   2. la preferencia guardada por el botón de la pantalla,
 *   3. lo configurado en el admin para el evento.
 */
export function resolveLowBandwidth(
  event: Pick<EventProfile, "lowBandwidthMode"> | null | undefined,
  searchParams?: { get(name: string): string | null } | null
): boolean {
  const fromQuery = searchParams?.get(LOW_BANDWIDTH_QUERY_PARAM);
  if (fromQuery != null && fromQuery !== "") {
    return fromQuery !== "0" && fromQuery.toLowerCase() !== "false";
  }

  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(LOW_BANDWIDTH_STORAGE_KEY);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {
      /* sessionStorage bloqueado — se sigue con la config del evento */
    }
  }

  return event?.lowBandwidthMode === true;
}

/** Guarda (o borra, con `null`) la preferencia del botón de la pantalla. */
export function setLowBandwidthPreference(value: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) sessionStorage.removeItem(LOW_BANDWIDTH_STORAGE_KEY);
    else sessionStorage.setItem(LOW_BANDWIDTH_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* sessionStorage bloqueado — el modo igual vive en el estado de React */
  }
}

/**
 * Devuelve el evento con todo lo caro apagado. Si `enabled` es false devuelve
 * el mismo objeto (identidad estable, para no invalidar memos ni disparar
 * efectos que dependen de `event`).
 *
 * `lowBandwidthMode: true` queda puesto en el resultado a propósito: es la
 * señal que leen los pocos lugares que necesitan saber que el modo está
 * activo y no solo recibir el efecto ya aplicado (la calidad de captura, el
 * badge del botón).
 */
/**
 * Qué revelado queda cuando no se pueden descargar modelos.
 *
 * - ROLLER / ROLLER_COLOR prefetchean onnxruntime (24 MB + 13 MB) y el modelo
 *   de detección (12 MB) en plena sesión, saturando el mismo enlace por el
 *   que tiene que subir la foto. Se degradan al velo con la mano, que revela
 *   igual y no descarga nada.
 * - El velo con la mano, sin MediaPipe, solo se puede borrar tocando y
 *   arrastrando. Eso funciona en un kiosco de una sola pantalla, pero cuando
 *   el revelado ocurre en la pantalla gigante (`mirrorScreenEnabled`) nadie
 *   la toca: quedaría una espera muerta hasta que salte el timeout de
 *   `paintTimeSeconds` (28 s por defecto). Ahí conviene pasar directo al
 *   resultado.
 * - KINECT_ROLLER se respeta tal cual: su detección corre en el PC que maneja
 *   la pantalla gigante y no baja un solo byte al navegador.
 */
function lowBandwidthRevealEffect(event: EventProfile): EventProfile["revealEffect"] {
  const effect = event.revealEffect ?? "HAND_WIPE";
  if (effect === "KINECT_ROLLER" || effect === "NONE") return effect;

  const revealsOnMirror = event.mirrorScreenEnabled !== false;
  return revealsOnMirror ? "NONE" : "HAND_WIPE";
}

export function applyLowBandwidth(event: EventProfile, enabled: boolean): EventProfile {
  if (!enabled) return event;

  return {
    ...event,
    lowBandwidthMode: true,

    revealEffect: lowBandwidthRevealEffect(event),

    // MediaPipe: hand_landmarker.task (7.8 MB) + vision_wasm_internal.wasm
    // (11.7 MB). Sin esto el revelado y la navegación caen al fallback táctil.
    handCursorEnabled: false,
    handRevealEnabled: false,

    // Videos de fondo: cada loop es una descarga grande y sostenida. Ambas
    // pantallas tienen fallback a imagen fija.
    screenSaverVideoUrl: undefined,
    splashUseVideo: false,
    splashVideoUrl: undefined,

    // Costo de dispositivo, no de red — pero es lo que traba las tablets.
    backgroundAnimation: "NONE",
    buttonClickEffect: "NONE",
  };
}

/** Calidad/tamaño con que se captura la foto que se sube. */
export function captureQualityFor(enabled: boolean): CaptureQuality {
  return enabled ? CAPTURE_LOW_BANDWIDTH : CAPTURE_NORMAL;
}

/** Calidad/tamaño de la copia de preview que consume la pantalla espejo. */
export function previewUploadQualityFor(enabled: boolean): CaptureQuality {
  return enabled ? PREVIEW_UPLOAD_LOW_BANDWIDTH : PREVIEW_UPLOAD_NORMAL;
}
