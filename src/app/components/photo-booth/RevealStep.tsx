/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import FrameCamera from "@/app/components/photo-booth/FrameCamera";
import { composeFramedCanvas } from "@/app/components/photo-booth/composeFramedImage";

// ── Configuración ──────────────────────────────────────────────────────────────
const CANVAS_SIZE = 1024;
const REVEAL_THRESHOLD = 0.7; // % del velo borrado que auto-completa el revelado
const SAFETY_TIMEOUT_MS = 28000; // si nadie interactúa, avanza igual
const BRUSH_RADIUS_RATIO = 0.09; // radio del "borrador" relativo al canvas
const PROGRESS_CHECK_INTERVAL_MS = 350;
const PROGRESS_SAMPLE_SIZE = 48; // miniatura offscreen para medir % borrado
const FADE_OUT_MS = 700;
const DEFAULT_VEIL_COLOR = "#0a0a0a";
const MODEL_ASSET_PATH = "/mediapipe/hand_landmarker.task";
const WASM_ASSET_PATH = "/mediapipe/wasm";
// Landmarks de muñeca + base de los 4 dedos: centroide = posición de la palma
const PALM_LANDMARK_INDEXES = [0, 5, 9, 13, 17];
// ──────────────────────────────────────────────────────────────────────────────

type Point = { x: number; y: number };

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  size: number,
) {
  const scale = Math.max(size / sw, size / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (size - dw) / 2;
  const dy = (size - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
}

export default function RevealStep({
  aiUrl,
  videoUrl,
  frameSrc = null,
  enableFrame = true,
  revealColorHint = null,
  onRevealed,
}: {
  aiUrl: string;
  videoUrl?: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  revealColorHint?: string | null;
  onRevealed: () => void;
}) {
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const veilCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const handRafRef = useRef<number | null>(null);
  const videoDrawRafRef = useRef<number | null>(null);
  const lastHandPointRef = useRef<Point | null>(null);
  const lastPointerPointRef = useRef<Point | null>(null);
  const completedRef = useRef(false);
  const pointerActiveRef = useRef(false);

  const [videoReady, setVideoReady] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  const [handTrackingReady, setHandTrackingReady] = useState(false);
  const [handTrackingError, setHandTrackingError] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const resolvedVeilColor = useMemo(() => {
    if (
      typeof window !== "undefined" &&
      revealColorHint &&
      typeof CSS !== "undefined" &&
      CSS.supports?.("color", revealColorHint)
    ) {
      return revealColorHint;
    }
    return DEFAULT_VEIL_COLOR;
  }, [revealColorHint]);

  const SIZE_IMG = "clamp(300px, min(70vw, 60svh), 700px)";

  // === Avanzar al resultado (una sola vez) ===
  const completeReveal = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setRevealing(true);
    window.setTimeout(onRevealed, prefersReducedMotion ? 0 : FADE_OUT_MS);
  }, [onRevealed, prefersReducedMotion]);

  // === Recibir el <video> de la cámara (self-view) ===
  const onCameraReady = React.useCallback(
    ({ getVideoEl }: { getVideoEl: () => HTMLVideoElement | null }) => {
      const v = getVideoEl();
      videoElRef.current = v;
      if (v) {
        if (v.readyState >= 2) setVideoReady(true);
        else v.onloadedmetadata = () => setVideoReady(true);
      }
    },
    [],
  );

  // === Dibuja la foto/video resultado en el canvas de fondo ===
  useEffect(() => {
    let cancelled = false;
    const photoCanvas = photoCanvasRef.current;
    if (!photoCanvas) return;
    const pctx = photoCanvas.getContext("2d")!;

    if (videoUrl) {
      const vid = document.createElement("video");
      vid.src = videoUrl;
      vid.crossOrigin = "anonymous";
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.autoplay = true;

      let frameImg: HTMLImageElement | null = null;
      if (enableFrame && frameSrc) {
        const fi = new Image();
        fi.crossOrigin = "anonymous";
        fi.onload = () => {
          frameImg = fi;
        };
        fi.src = frameSrc;
      }

      let markedReady = false;
      const drawVideoFrame = () => {
        if (cancelled) return;
        if (vid.readyState >= 2) {
          drawCover(
            pctx,
            vid,
            vid.videoWidth || CANVAS_SIZE,
            vid.videoHeight || CANVAS_SIZE,
            CANVAS_SIZE,
          );
          if (frameImg) pctx.drawImage(frameImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
          if (!markedReady) {
            markedReady = true;
            setPhotoReady(true);
          }
        }
        videoDrawRafRef.current = requestAnimationFrame(drawVideoFrame);
      };
      vid.play().catch(() => {});
      videoDrawRafRef.current = requestAnimationFrame(drawVideoFrame);

      return () => {
        cancelled = true;
        if (videoDrawRafRef.current) cancelAnimationFrame(videoDrawRafRef.current);
        vid.pause();
        vid.src = "";
      };
    }

    composeFramedCanvas({ aiUrl, frameSrc, enableFrame, size: CANVAS_SIZE })
      .then((canvas) => {
        if (cancelled) return;
        pctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        pctx.drawImage(canvas, 0, 0);
        setPhotoReady(true);
      })
      .catch((err) => {
        console.error("[RevealStep] Error componiendo imagen:", err);
        setPhotoReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [aiUrl, videoUrl, frameSrc, enableFrame]);

  // === Pinta el velo sólido inicial ===
  useEffect(() => {
    const veil = veilCanvasRef.current;
    if (!veil) return;
    const ctx = veil.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = resolvedVeilColor;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, [resolvedVeilColor]);

  // === Borra un trazo suave entre dos puntos del velo (mano o dedo/mouse) ===
  const eraseStroke = React.useCallback((from: Point | null, to: Point) => {
    const veil = veilCanvasRef.current;
    if (!veil) return;
    const ctx = veil.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-out";
    const r = CANVAS_SIZE * BRUSH_RADIUS_RATIO;

    const drawDot = (p: Point) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    if (!from) {
      drawDot(to);
      return;
    }
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.floor(dist / (r * 0.5)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      drawDot({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }, []);

  // === Inicializa MediaPipe HandLandmarker (self-hosted, sin CDN) ===
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { FilesetResolver, HandLandmarker } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_ASSET_PATH);

        const create = (delegate: "GPU" | "CPU") =>
          HandLandmarker.createFromOptions(filesetResolver, {
            baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate },
            runningMode: "VIDEO",
            numHands: 1,
          });

        let landmarker;
        try {
          landmarker = await create("GPU");
        } catch {
          landmarker = await create("CPU");
        }

        if (cancelled) {
          landmarker.close();
          return;
        }
        handLandmarkerRef.current = landmarker;
        setHandTrackingReady(true);
      } catch (err) {
        console.warn("[RevealStep] Hand tracking no disponible, se usa solo touch/skip:", err);
        setHandTrackingError(true);
      }
    })();

    return () => {
      cancelled = true;
      handLandmarkerRef.current?.close?.();
      handLandmarkerRef.current = null;
    };
  }, []);

  // === Loop de detección de mano → borra el velo siguiendo la palma ===
  useEffect(() => {
    if (!handTrackingReady || !videoReady) return;
    const video = videoElRef.current;
    if (!video) return;

    const tick = () => {
      const hl = handLandmarkerRef.current;
      if (hl && video.readyState >= 2) {
        try {
          const result = hl.detectForVideo(video, performance.now());
          const landmarks = result?.landmarks?.[0];
          if (landmarks && landmarks.length > 0) {
            let sx = 0;
            let sy = 0;
            for (const i of PALM_LANDMARK_INDEXES) {
              sx += landmarks[i].x;
              sy += landmarks[i].y;
            }
            const nx = sx / PALM_LANDMARK_INDEXES.length;
            const ny = sy / PALM_LANDMARK_INDEXES.length;
            const mirroredX = 1 - nx; // el self-view se muestra espejado
            const point = { x: mirroredX * CANVAS_SIZE, y: ny * CANVAS_SIZE };
            eraseStroke(lastHandPointRef.current, point);
            lastHandPointRef.current = point;
          } else {
            lastHandPointRef.current = null;
          }
        } catch {
          // silencioso: un frame fallido no debe romper el loop
        }
      }
      handRafRef.current = requestAnimationFrame(tick);
    };

    handRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (handRafRef.current) cancelAnimationFrame(handRafRef.current);
    };
  }, [handTrackingReady, videoReady, eraseStroke]);

  // === Fallback táctil: tocar/arrastrar sobre el velo también borra ===
  const pointToCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return { x: nx * CANVAS_SIZE, y: ny * CANVAS_SIZE };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerActiveRef.current = true;
    const p = pointToCanvas(e);
    eraseStroke(null, p);
    lastPointerPointRef.current = p;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerActiveRef.current) return;
    const p = pointToCanvas(e);
    eraseStroke(lastPointerPointRef.current, p);
    lastPointerPointRef.current = p;
  };

  const handlePointerUp = () => {
    pointerActiveRef.current = false;
    lastPointerPointRef.current = null;
  };

  // === Chequeo periódico de % revelado → auto-completa al cruzar el umbral ===
  useEffect(() => {
    if (!photoReady) return;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = PROGRESS_SAMPLE_SIZE;
    sampleCanvas.height = PROGRESS_SAMPLE_SIZE;
    const sctx = sampleCanvas.getContext("2d")!;

    const id = window.setInterval(() => {
      if (completedRef.current) return;
      const veil = veilCanvasRef.current;
      if (!veil) return;
      sctx.clearRect(0, 0, PROGRESS_SAMPLE_SIZE, PROGRESS_SAMPLE_SIZE);
      sctx.drawImage(veil, 0, 0, PROGRESS_SAMPLE_SIZE, PROGRESS_SAMPLE_SIZE);
      const data = sctx.getImageData(0, 0, PROGRESS_SAMPLE_SIZE, PROGRESS_SAMPLE_SIZE).data;
      let transparent = 0;
      const total = PROGRESS_SAMPLE_SIZE * PROGRESS_SAMPLE_SIZE;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 40) transparent++;
      }
      if (transparent / total >= REVEAL_THRESHOLD) completeReveal();
    }, PROGRESS_CHECK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [photoReady, completeReveal]);

  // === Timeout de seguridad: nunca deja el kiosco trabado ===
  useEffect(() => {
    const id = window.setTimeout(completeReveal, SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [completeReveal]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden">
      <p
        className="absolute top-[6%] z-20 text-center text-white text-sm sm:text-base font-medium drop-shadow-lg px-6 animate-fadeIn"
        role="status"
        aria-live="polite"
      >
        {handTrackingError
          ? "Toca y desliza la pantalla para revelar tu foto"
          : "Mueve tu mano frente a la cámara para revelar tu foto"}
      </p>

      <div
        className="relative overflow-hidden bg-black/5 aspect-square rounded-2xl shadow-2xl"
        style={{
          width: SIZE_IMG,
          maxWidth: SIZE_IMG,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2)",
        }}
      >
        <canvas
          ref={photoCanvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="absolute inset-0 w-full h-full object-contain"
        />
        <canvas
          ref={veilCanvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="absolute inset-0 w-full h-full object-contain touch-none select-none cursor-pointer"
          style={{
            opacity: revealing ? 0 : 1,
            transition: prefersReducedMotion ? "none" : `opacity ${FADE_OUT_MS}ms ease-out`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {/* Self-view de cámara: ayuda a la persona a ubicar su mano */}
      <div className="absolute bottom-5 right-5 z-20 w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-white/60 shadow-xl">
        <FrameCamera mirror boxSize="100%" onReady={onCameraReady} />
      </div>

      <button
        type="button"
        onClick={completeReveal}
        className="absolute bottom-5 left-5 z-20 text-xs sm:text-sm text-white/70 hover:text-white underline underline-offset-2"
      >
        Saltar
      </button>
    </div>
  );
}
