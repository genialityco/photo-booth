/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Singleton compartido: una sola cámara + un solo HandLandmarker para toda la
// app. Varios consumidores (HandCursorOverlay, RevealStep, etc.) pueden
// "reservar" el tracking a la vez con acquireHandTracking(); la cámara solo
// se detiene cuando el último consumidor libera su reserva. Así el cursor
// global y cualquier interacción por gesto (ej. borrar el velo en
// RevealStep) siempre leen exactamente la misma posición de mano.

const MODEL_ASSET_PATH = "/mediapipe/hand_landmarker.task";
const WASM_ASSET_PATH = "/mediapipe/wasm";
// Distancia pulgar-índice (normalizada por el tamaño de la mano) para
// considerar que hay pellizco. Histéresis: el umbral de entrada es más
// exigente que el de salida, para que el gesto no "parpadee".
const PINCH_ON_RATIO = 0.35;
const PINCH_OFF_RATIO = 0.5;
// Puño cerrado: por dedo, ratio (distancia punta-al-centro-de-palma /
// distancia nudillo-al-centro-de-palma). >1 = dedo extendido, <1 = dedo
// curvado hacia la palma. Se cuenta cuántos de los 4 dedos están curvados en
// vez de promediar, para tolerar puños imperfectos (un dedo no del todo
// cerrado no debería impedir detectar el gesto). Histéresis: se necesitan
// más dedos curvados para "entrar" en el agarre que para mantenerlo.
const GRIP_FINGER_CURL_RATIO = 1.4;
const GRIP_ON_MIN_CURLED = 3; // de 4 dedos
const GRIP_OFF_MIN_CURLED = 2;
const SMOOTHING = 0.35; // 0-1, más alto = más suave pero con más lag
// Punta + nudillo (MCP) de índice, medio, anular y meñique (se excluye el
// pulgar: su geometría al cerrar el puño no sigue el mismo patrón).
const GRIP_FINGER_LANDMARKS: Array<[tip: number, mcp: number]> = [
  [8, 5],
  [12, 9],
  [16, 13],
  [20, 17],
];
const PALM_MCP_LANDMARKS = [5, 9, 13, 17];

export type HandFrame = {
  visible: boolean;
  pinching: boolean;
  /** Puño cerrado (como agarrando algo), ej. para el efecto de rodillo. */
  gripping: boolean;
  /** Posición en píxeles de ventana (window), espejada como self-view. */
  screenX: number;
  screenY: number;
  /** Misma posición normalizada 0-1 (ya espejada en X). */
  normX: number;
  normY: number;
};

export type HandTrackingStatus = "idle" | "loading" | "ready" | "error";

type FrameListener = (frame: HandFrame) => void;
type StatusListener = (status: HandTrackingStatus) => void;

let refCount = 0;
let starting: Promise<void> | null = null;
let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let landmarker: any = null;
let rafId: number | null = null;
let status: HandTrackingStatus = "idle";

const frameListeners = new Set<FrameListener>();
const statusListeners = new Set<StatusListener>();
const smoothed = { x: 0, y: 0 };
let hasSmoothed = false;
let pinching = false;
let gripping = false;

function setStatus(next: HandTrackingStatus) {
  status = next;
  statusListeners.forEach((cb) => cb(status));
}

function emitFrame(frame: HandFrame) {
  frameListeners.forEach((cb) => cb(frame));
}

async function start() {
  if (starting) return starting;

  starting = (async () => {
    setStatus("loading");
    try {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;

      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (refCount === 0) {
        s.getTracks().forEach((t) => t.stop());
        setStatus("idle");
        return;
      }

      video = v;
      stream = s;
      v.srcObject = s;
      await new Promise<void>((resolve) => {
        v.onloadedmetadata = () => resolve();
      });
      await v.play().catch(() => {});

      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, HandLandmarker } = vision;
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_ASSET_PATH);

      const create = (delegate: "GPU" | "CPU") =>
        HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate },
          runningMode: "VIDEO",
          numHands: 1,
        });

      let created;
      try {
        created = await create("GPU");
      } catch {
        created = await create("CPU");
      }

      if (refCount === 0) {
        created.close();
        stop();
        return;
      }

      landmarker = created;
      setStatus("ready");
      loop();
    } catch (err) {
      console.warn("[handTrackingStore] tracking de mano no disponible:", err);
      stop();
      setStatus("error");
    } finally {
      starting = null;
    }
  })();

  return starting;
}

function stop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  landmarker?.close?.();
  landmarker = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video = null;
  hasSmoothed = false;
  pinching = false;
  gripping = false;
}

function loop() {
  const v = video;
  const hl = landmarker;
  if (hl && v && v.readyState >= 2) {
    try {
      const result = hl.detectForVideo(v, performance.now());
      const landmarks = result?.landmarks?.[0];

      if (landmarks && landmarks.length > 0) {
        const thumb = landmarks[4];
        const index = landmarks[8];
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];

        const rawX = (thumb.x + index.x) / 2;
        const rawY = (thumb.y + index.y) / 2;
        const mirroredX = 1 - rawX; // self-view espejado

        if (!hasSmoothed) {
          smoothed.x = mirroredX;
          smoothed.y = rawY;
          hasSmoothed = true;
        } else {
          smoothed.x += (mirroredX - smoothed.x) * (1 - SMOOTHING);
          smoothed.y += (rawY - smoothed.y) * (1 - SMOOTHING);
        }

        const handSize = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y) || 1;
        const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y) / handSize;
        pinching = pinching ? pinchDist < PINCH_OFF_RATIO : pinchDist < PINCH_ON_RATIO;

        let palmX = 0;
        let palmY = 0;
        for (const i of PALM_MCP_LANDMARKS) {
          palmX += landmarks[i].x;
          palmY += landmarks[i].y;
        }
        palmX /= PALM_MCP_LANDMARKS.length;
        palmY /= PALM_MCP_LANDMARKS.length;

        let curledFingers = 0;
        for (const [tipIdx, mcpIdx] of GRIP_FINGER_LANDMARKS) {
          const tip = landmarks[tipIdx];
          const mcp = landmarks[mcpIdx];
          const tipDist = Math.hypot(tip.x - palmX, tip.y - palmY);
          const mcpDist = Math.hypot(mcp.x - palmX, mcp.y - palmY) || 0.0001;
          if (tipDist / mcpDist < GRIP_FINGER_CURL_RATIO) curledFingers++;
        }
        gripping = gripping ? curledFingers >= GRIP_OFF_MIN_CURLED : curledFingers >= GRIP_ON_MIN_CURLED;

        emitFrame({
          visible: true,
          pinching,
          gripping,
          normX: smoothed.x,
          normY: smoothed.y,
          screenX: smoothed.x * window.innerWidth,
          screenY: smoothed.y * window.innerHeight,
        });
      } else {
        hasSmoothed = false;
        pinching = false;
        gripping = false;
        emitFrame({
          visible: false,
          pinching: false,
          gripping: false,
          normX: 0,
          normY: 0,
          screenX: 0,
          screenY: 0,
        });
      }
    } catch {
      // un frame fallido no debe romper el loop
    }
  }
  rafId = requestAnimationFrame(loop);
}

/**
 * Reserva el tracking compartido (arranca cámara + landmarker si nadie más
 * lo está usando). Devuelve una función para liberar la reserva; la cámara
 * se detiene automáticamente cuando el último consumidor la libera.
 */
export function acquireHandTracking(): () => void {
  refCount++;
  if (refCount === 1) void start();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      stop();
      setStatus("idle");
    }
  };
}

export function subscribeHandFrame(cb: FrameListener): () => void {
  frameListeners.add(cb);
  return () => frameListeners.delete(cb);
}

export function subscribeHandTrackingStatus(cb: StatusListener): () => void {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

export function getHandTrackingStatus(): HandTrackingStatus {
  return status;
}

export function getHandTrackingStream(): MediaStream | null {
  return stream;
}
