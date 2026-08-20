/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Singleton compartido: una sola cámara + una sola sesión ONNX para detectar
// el rodillo de pintura REAL (objeto físico, no un gesto de mano). Mismo
// patrón que handTrackingStore.ts: varios consumidores pueden "reservar" la
// detección a la vez con acquireRollerDetection(); la cámara solo se detiene
// cuando el último consumidor libera su reserva.
//
// Modelo: YOLOv8 "small" (nano) entrenado a medida (clase única
// "rodillo_pintura"), exportado a ONNX con imgsz=320 y sin NMS embebido
// (basta con quedarse con la detección de mayor confianza, ya que solo nos
// interesa un rodillo a la vez). Antes de correr la inferencia se mejora el
// frame (ruido, contraste, nitidez) para que el detector rinda mejor con
// cámaras web mediocres y condiciones de luz variables — ver
// rollerImagePreprocess.ts. Todo esto (modelo, preprocesamiento, umbrales,
// suavizado) está portado 1:1 de la app de referencia
// C:\Users\sagp7\Documents\trainrodillo\webapp_demo.html, usada para probar
// este modelo entrenado a medida.

import { applyDenoise, applyHistEq, applySharpen } from "@/app/components/photo-booth/reveal/rollerImagePreprocess";

const MODEL_PATH = "/models/rodillo-detector/best.onnx";
const WASM_DIR = "/ort/";
const INPUT_SIZE = 320;
const CONF_THRESHOLD = 0.25;
// EMA: fracción del valor NUEVO que se mezcla en cada frame (más bajo = más
// suave pero el objetivo sigue la detección cruda más lento).
const SMOOTH_ALPHA = 0.35;
// Frames sin detección por encima del umbral antes de dar por "perdido" el
// rodillo — evita parpadeo cuando la confianza baja un instante.
const GRACE_FRAMES = 5;
// Corrección fina (px de pantalla) para la posición Y detectada: al levantar
// el rodillo real hasta el borde superior del encuadre de la cámara, la
// detección no alcanza a llegar a Y=0 (el modelo pierde confianza cerca del
// borde de la imagen), por lo que la parte superior de la foto quedaba fuera
// de alcance. Negativo = sube el punto mapeado, dándole más margen para
// llegar arriba del todo.
const SCREEN_Y_OFFSET_PX = -100;
// Amplía el rango vertical detectado alrededor del centro (0.5), para que
// llegue un poco más arriba Y más abajo — el modelo rara vez reporta
// detecciones muy cerca de los bordes de la imagen (pierde confianza ahí),
// así que el rango "útil" queda más angosto que la foto completa. >1 = más
// alcance en ambos extremos.
const Y_RANGE_SCALE = 1.3;

/** Expande normY alrededor de 0.5 según Y_RANGE_SCALE (puede salir de [0,1] a propósito). */
function expandNormY(normY: number): number {
  return 0.5 + (normY - 0.5) * Y_RANGE_SCALE;
}

export type RollerFrame = {
  visible: boolean;
  /** Posición en píxeles de ventana (window), espejada como self-view. */
  screenX: number;
  screenY: number;
  /** Misma posición normalizada 0-1 (ya espejada en X). */
  normX: number;
  normY: number;
  /** Ancho/alto detectados del rodillo, en las mismas unidades que screenX/Y. */
  widthPx: number;
  heightPx: number;
  confidence: number;
};

export type RollerDetectionStatus = "idle" | "loading" | "ready" | "error";

type FrameListener = (frame: RollerFrame) => void;
type StatusListener = (status: RollerDetectionStatus) => void;

let refCount = 0;
let starting: Promise<void> | null = null;
// loop() es async (espera session.run()): un stop() a mitad de una
// inferencia en curso no alcanza a cancelar el próximo requestAnimationFrame
// con cancelAnimationFrame (ese id todavía no existe). Este flag es la
// guarda real: se revisa antes y después del await para no reprogramar un
// loop "zombie" una vez detenido.
let running = false;
let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let session: any = null;
let ortModule: any = null;
let rafId: number | null = null;
let status: RollerDetectionStatus = "idle";

const frameListeners = new Set<FrameListener>();
const statusListeners = new Set<StatusListener>();

// Reutilizados entre frames para no generar basura en cada iteración del loop.
let inputCanvas: HTMLCanvasElement | null = null;
let inputCtx: CanvasRenderingContext2D | null = null;
let inputTensorData: Float32Array | null = null;

const smoothedBox = { x: 0, y: 0, w: 0, h: 0 };
let hasSmoothedBox = false;
let missingFrames = 0;

function setStatus(next: RollerDetectionStatus) {
  status = next;
  statusListeners.forEach((cb) => cb(status));
}

function emitFrame(frame: RollerFrame) {
  frameListeners.forEach((cb) => cb(frame));
}

async function start() {
  if (starting) return starting;

  starting = (async () => {
    console.log("[rollerDetectionStore] iniciando: pidiendo cámara...");
    setStatus("loading");
    try {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;

      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      console.log("[rollerDetectionStore] cámara obtenida");

      if (refCount === 0) {
        s.getTracks().forEach((t) => t.stop());
        setStatus("idle");
        return;
      }

      video = v;
      stream = s;
      v.srcObject = s;
      await new Promise<void>((resolve) => {
        v.addEventListener("loadedmetadata", () => resolve(), { once: true });
      });
      await v.play().catch(() => {});
      console.log("[rollerDetectionStore] video listo, cargando onnxruntime-web...");

      // Probamos WebGPU primero (backend moderno, mucho más rápido que WASM
      // de un solo hilo) y si no está disponible caemos a WASM. El backend
      // WebGL legado se descartó: el grafo exportado de este modelo usa el
      // operador 'Split' (opset 20), que esa implementación vieja no
      // soporta — falla siempre, así que no vale la pena intentarlo.
      // "./webgpu" usa el binario WASM "asyncify" autohospedado en
      // /public/ort (el bundle "onnxruntime-web" por defecto trae TODOS los
      // backends y pide la variante .jsep, que no copiamos); "./wasm" usa el
      // binario plano, ya probado y funcionando.
      let ort: any;
      let createdSession: any;
      try {
        ort = await import("onnxruntime-web/webgpu");
        ort.env.wasm.wasmPaths = WASM_DIR;
        ort.env.wasm.numThreads = 1;
        console.log("[rollerDetectionStore] intentando backend WebGPU...");
        createdSession = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ["webgpu"],
        });
        console.log("[rollerDetectionStore] modelo de rodillo cargado (WebGPU):", MODEL_PATH);
      } catch (webgpuErr) {
        console.warn("[rollerDetectionStore] WebGPU no disponible, probando WASM:", webgpuErr);
        ort = await import("onnxruntime-web/wasm");
        ort.env.wasm.wasmPaths = WASM_DIR;
        // Fuerza single-thread: evita depender de SharedArrayBuffer/COOP-COEP
        // (Netlify no envía esos headers), a costa de algo de velocidad.
        ort.env.wasm.numThreads = 1;
        console.log("[rollerDetectionStore] creando sesión WASM con", MODEL_PATH, "...");
        createdSession = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ["wasm"],
        });
        console.log("[rollerDetectionStore] modelo de rodillo cargado (WASM):", MODEL_PATH);
      }
      ortModule = ort;

      if (refCount === 0) {
        stop();
        return;
      }

      session = createdSession;
      inputCanvas = document.createElement("canvas");
      inputCanvas.width = INPUT_SIZE;
      inputCanvas.height = INPUT_SIZE;
      inputCtx = inputCanvas.getContext("2d", { willReadFrequently: true });
      inputTensorData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

      running = true;
      setStatus("ready");
      loop();
    } catch (err) {
      console.warn("[rollerDetectionStore] detección de rodillo no disponible:", err);
      stop();
      setStatus("error");
    } finally {
      starting = null;
    }
  })();

  return starting;
}

function stop() {
  running = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  session?.release?.();
  session = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video = null;
  inputCanvas = null;
  inputCtx = null;
  inputTensorData = null;
  hasSmoothedBox = false;
  missingFrames = 0;
}

async function loop() {
  if (!running) return;

  const v = video;
  const s = session;
  const ctx = inputCtx;
  const canvas = inputCanvas;
  const data = inputTensorData;
  const ort = ortModule;

  if (s && v && ctx && canvas && data && ort && v.readyState >= 2) {
    try {
      ctx.drawImage(v, 0, 0, INPUT_SIZE, INPUT_SIZE);
      const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

      // Orden igual al de la app de referencia: ruido -> contraste -> nitidez.
      applyDenoise(imageData);
      applyHistEq(imageData);
      applySharpen(imageData);

      const pixels = imageData.data;
      const plane = INPUT_SIZE * INPUT_SIZE;
      for (let i = 0; i < plane; i++) {
        const px = i * 4;
        data[i] = pixels[px] / 255;
        data[plane + i] = pixels[px + 1] / 255;
        data[2 * plane + i] = pixels[px + 2] / 255;
      }

      const tensor = new ort.Tensor("float32", data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const inputName = s.inputNames[0];
      const outputName = s.outputNames[0];
      const results = await s.run({ [inputName]: tensor });
      const output = results[outputName].data as Float32Array;
      const numDetections = output.length / 5;

      let bestScore = 0;
      let bestIdx = -1;
      for (let i = 0; i < numDetections; i++) {
        const score = output[4 * numDetections + i];
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0 && bestScore >= CONF_THRESHOLD) {
        const xc = output[0 * numDetections + bestIdx];
        const yc = output[1 * numDetections + bestIdx];
        const w = output[2 * numDetections + bestIdx];
        const h = output[3 * numDetections + bestIdx];

        if (!hasSmoothedBox) {
          smoothedBox.x = xc;
          smoothedBox.y = yc;
          smoothedBox.w = w;
          smoothedBox.h = h;
          hasSmoothedBox = true;
        } else {
          smoothedBox.x = smoothedBox.x * (1 - SMOOTH_ALPHA) + xc * SMOOTH_ALPHA;
          smoothedBox.y = smoothedBox.y * (1 - SMOOTH_ALPHA) + yc * SMOOTH_ALPHA;
          smoothedBox.w = smoothedBox.w * (1 - SMOOTH_ALPHA) + w * SMOOTH_ALPHA;
          smoothedBox.h = smoothedBox.h * (1 - SMOOTH_ALPHA) + h * SMOOTH_ALPHA;
        }
        missingFrames = 0;

        const normXRaw = smoothedBox.x / INPUT_SIZE;
        const normY = smoothedBox.y / INPUT_SIZE;
        const normX = 1 - normXRaw; // self-view espejado, igual que handTrackingStore

        emitFrame({
          visible: true,
          normX,
          normY,
          screenX: normX * window.innerWidth,
          screenY: expandNormY(normY) * window.innerHeight + SCREEN_Y_OFFSET_PX,
          widthPx: (smoothedBox.w / INPUT_SIZE) * window.innerWidth,
          heightPx: (smoothedBox.h / INPUT_SIZE) * window.innerHeight,
          confidence: bestScore,
        });
      } else if (hasSmoothedBox && missingFrames < GRACE_FRAMES) {
        missingFrames++;
        const normXRaw = smoothedBox.x / INPUT_SIZE;
        const normY = smoothedBox.y / INPUT_SIZE;
        const normX = 1 - normXRaw;
        emitFrame({
          visible: true,
          normX,
          normY,
          screenX: normX * window.innerWidth,
          screenY: expandNormY(normY) * window.innerHeight + SCREEN_Y_OFFSET_PX,
          widthPx: (smoothedBox.w / INPUT_SIZE) * window.innerWidth,
          heightPx: (smoothedBox.h / INPUT_SIZE) * window.innerHeight,
          confidence: bestScore,
        });
      } else {
        hasSmoothedBox = false;
        missingFrames = 0;
        emitFrame({
          visible: false,
          normX: 0,
          normY: 0,
          screenX: 0,
          screenY: 0,
          widthPx: 0,
          heightPx: 0,
          confidence: 0,
        });
      }
    } catch (err) {
      console.warn("[rollerDetectionStore] frame de detección fallido:", err);
    }
  }

  if (!running) return;
  rafId = requestAnimationFrame(() => void loop());
}

/**
 * Reserva la detección compartida (arranca cámara + sesión ONNX si nadie más
 * la está usando). Devuelve una función para liberar la reserva; la cámara
 * se detiene automáticamente cuando el último consumidor la libera.
 */
export function acquireRollerDetection(): () => void {
  refCount++;
  console.log("[rollerDetectionStore] acquireRollerDetection, refCount:", refCount);
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

export function subscribeRollerFrame(cb: FrameListener): () => void {
  frameListeners.add(cb);
  return () => frameListeners.delete(cb);
}

export function subscribeRollerDetectionStatus(cb: StatusListener): () => void {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

export function getRollerDetectionStatus(): RollerDetectionStatus {
  return status;
}

export function getRollerDetectionStream(): MediaStream | null {
  return stream;
}
