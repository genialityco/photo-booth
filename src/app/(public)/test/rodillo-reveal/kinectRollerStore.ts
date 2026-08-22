"use client";

// Singleton compartido: una sola conexión WebSocket al backend Python del
// Kinect (kinect-roller-backend/, ver README ahí). Mismo patrón pub/sub que
// rollerDetectionStore.ts (la versión webcam+ONNX que usa RollerRevealStep
// en producción), pero la fuente de posición acá es el Kinect real en vez
// de una cámara + modelo entrenado.
//
// Mensaje esperado del backend (--method shape, el default):
//   { type: "roller", touching: bool, x: number, y: number, angle_deg?: number,
//     length_cm?: number, width_cm?: number, height_mm?: number, timestamp: number }
// o al perderse la detección: { type: "roller", touching: false, lost: true, ... }

export type KinectRollerFrame = {
  /** true mientras el backend reporta una detección (tocando o en el aire). */
  visible: boolean;
  /** true solo cuando el rodillo está apoyado sobre la pantalla. */
  touching: boolean;
  /** Posición en píxeles de ventana (window), sin espejar. */
  screenX: number;
  screenY: number;
  /** Misma posición normalizada 0-1 tal como la manda el backend. */
  normX: number;
  normY: number;
  /** Tamaño aproximado en píxeles de pantalla (solo para el trazo/cursor -
   * no es una medida física exacta, ver KINECT_LENGTH_CM_TO_PX abajo). */
  widthPx: number;
  heightPx: number;
};

export type KinectConnectionStatus = "idle" | "connecting" | "open" | "closed" | "error";

type FrameListener = (frame: KinectRollerFrame) => void;
type StatusListener = (status: KinectConnectionStatus) => void;

// Escala aproximada cm -> px de pantalla para el tamaño del trazo, ya que el
// backend reporta centímetros físicos reales, no píxeles de una cámara.
// Ajusta a ojo si el trazo se ve muy chico/grande comparado con el rodillo real.
const KINECT_CM_TO_PX = 9;
const DEFAULT_STROKE_PX = 220; // usado cuando el backend no informa length_cm (p.ej. modo hand)
const RECONNECT_DELAY_MS = 2000;

let ws: WebSocket | null = null;
let refCount = 0;
let currentUrl = "";
let status: KinectConnectionStatus = "idle";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const frameListeners = new Set<FrameListener>();
const statusListeners = new Set<StatusListener>();

function setStatus(next: KinectConnectionStatus) {
  status = next;
  statusListeners.forEach((cb) => cb(status));
}

function emitFrame(frame: KinectRollerFrame) {
  frameListeners.forEach((cb) => cb(frame));
}

function emitLost() {
  emitFrame({
    visible: false,
    touching: false,
    screenX: 0,
    screenY: 0,
    normX: 0,
    normY: 0,
    widthPx: 0,
    heightPx: 0,
  });
}

function handleMessage(event: MessageEvent) {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(event.data as string);
  } catch {
    console.warn("[kinectRollerStore] mensaje no es JSON válido:", event.data);
    return;
  }
  if (data.type !== "roller") return;
  if (data.lost) {
    emitLost();
    return;
  }

  const normX = typeof data.x === "number" ? data.x : 0;
  const normY = typeof data.y === "number" ? data.y : 0;
  const lengthCm = typeof data.length_cm === "number" ? data.length_cm : null;
  const widthCm = typeof data.width_cm === "number" ? data.width_cm : null;

  emitFrame({
    visible: true,
    touching: !!data.touching,
    normX,
    normY,
    screenX: normX * window.innerWidth,
    screenY: normY * window.innerHeight,
    widthPx: lengthCm !== null ? lengthCm * KINECT_CM_TO_PX : DEFAULT_STROKE_PX,
    heightPx: widthCm !== null ? widthCm * KINECT_CM_TO_PX : DEFAULT_STROKE_PX * 0.3,
  });
}

function connect(url: string) {
  currentUrl = url;
  setStatus("connecting");
  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.warn("[kinectRollerStore] no se pudo crear el WebSocket:", err);
    setStatus("error");
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("[kinectRollerStore] conectado a", url);
    setStatus("open");
  };
  ws.onmessage = handleMessage;
  ws.onerror = (err) => {
    console.warn("[kinectRollerStore] error de WebSocket:", err);
    setStatus("error");
  };
  ws.onclose = () => {
    setStatus("closed");
    emitLost();
    ws = null;
    if (refCount > 0) scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (refCount > 0) connect(currentUrl);
  }, RECONNECT_DELAY_MS);
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

/**
 * Reserva la conexión compartida al backend del Kinect (se conecta si nadie
 * más lo está usando ya, o si la URL cambió). Devuelve una función para
 * liberar la reserva; la conexión se cierra cuando el último consumidor la
 * libera.
 */
export function acquireKinectRoller(url: string): () => void {
  refCount++;
  if (refCount === 1 || currentUrl !== url) {
    disconnect();
    connect(url);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      disconnect();
      setStatus("idle");
    }
  };
}

export function subscribeKinectFrame(cb: FrameListener): () => void {
  frameListeners.add(cb);
  return () => frameListeners.delete(cb);
}

export function subscribeKinectStatus(cb: StatusListener): () => void {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

export function getKinectStatus(): KinectConnectionStatus {
  return status;
}
