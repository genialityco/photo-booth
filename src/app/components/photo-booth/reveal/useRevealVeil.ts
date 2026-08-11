"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { composeFramedCanvas } from "@/app/components/photo-booth/composeFramedImage";

// ── Configuración compartida por todos los efectos de revelado ──────────────
export const CANVAS_SIZE = 1024;
const REVEAL_THRESHOLD = 0.7; // % del velo borrado que auto-completa el revelado
const SAFETY_TIMEOUT_MS = 28000; // si nadie interactúa, avanza igual
const PROGRESS_CHECK_INTERVAL_MS = 350;
const PROGRESS_SAMPLE_SIZE = 48; // miniatura offscreen para medir % borrado
export const FADE_OUT_MS = 700;
const DEFAULT_VEIL_COLOR = "#0a0a0a";
// ──────────────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };

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

export function useRevealVeil({
  aiUrl,
  videoUrl,
  frameSrc = null,
  enableFrame = true,
  revealColorHint = null,
  veilMode = "SOLID",
  onRevealed,
}: {
  aiUrl: string;
  videoUrl?: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  revealColorHint?: string | null;
  /** "SOLID" (default): velo de color plano. "GRAYSCALE_PHOTO": el velo es
   * una copia en blanco y negro de la propia foto/video, así al borrarlo
   * aparece el color de abajo en vez de descubrir una imagen distinta. */
  veilMode?: "SOLID" | "GRAYSCALE_PHOTO";
  onRevealed: () => void;
}) {
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const veilCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoDrawRafRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const [photoReady, setPhotoReady] = useState(false);
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

  // === Avanzar al resultado (una sola vez) ===
  const completeReveal = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setRevealing(true);
    window.setTimeout(onRevealed, prefersReducedMotion ? 0 : FADE_OUT_MS);
  }, [onRevealed, prefersReducedMotion]);

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
        console.error("[useRevealVeil] Error componiendo imagen:", err);
        setPhotoReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [aiUrl, videoUrl, frameSrc, enableFrame]);

  // === Pinta el velo inicial: color sólido, o (GRAYSCALE_PHOTO) una copia en
  // blanco y negro de la propia foto — se pinta una sola vez, como snapshot,
  // igual que el velo sólido: no se vuelve a redibujar después (si no, cada
  // repintado borraría el progreso ya revelado por la persona). ===
  useEffect(() => {
    const veil = veilCanvasRef.current;
    if (!veil) return;
    const ctx = veil.getContext("2d")!;

    if (veilMode === "GRAYSCALE_PHOTO") {
      if (!photoReady) return; // esperar a que haya algo que copiar
      const photoCanvas = photoCanvasRef.current;
      if (!photoCanvas) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      // grayscale + un poco menos de contraste/brillo levantado: la foto se
      // ve "lavada"/desteñida, para que el color se note mucho más al pintar.
      ctx.filter = "grayscale(1) contrast(0.8) brightness(1.12)";
      ctx.drawImage(photoCanvas, 0, 0);
      ctx.filter = "none";
      // Velo blanco semitransparente encima: sigue siendo 100% opaco en
      // conjunto (no deja pasar el color de abajo), pero visualmente aclara
      // y desatura aún más el blanco y negro — efecto "transparencia/neblina".
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.globalAlpha = 1;
      return;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = resolvedVeilColor;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, [resolvedVeilColor, veilMode, photoReady]);

  // === Borra una forma arbitraria del velo (destination-out) ===
  const eraseWithPath = useCallback((draw: (ctx: CanvasRenderingContext2D) => void) => {
    const veil = veilCanvasRef.current;
    if (!veil) return;
    const ctx = veil.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    draw(ctx);
    ctx.restore();
  }, []);

  // === Borra un trazo suave (círculos) entre dos puntos del velo ===
  const eraseStroke = useCallback(
    (from: Point | null, to: Point, radius: number = CANVAS_SIZE * 0.09) => {
      eraseWithPath((ctx) => {
        const drawDot = (p: Point) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        };
        if (!from) {
          drawDot(to);
          return;
        }
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.floor(dist / (radius * 0.5)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          drawDot({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
        }
      });
    },
    [eraseWithPath],
  );

  // === Chequeo periódico de % revelado → auto-completa al cruzar el umbral ===
  useEffect(() => {
    if (!photoReady) return;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = PROGRESS_SAMPLE_SIZE;
    sampleCanvas.height = PROGRESS_SAMPLE_SIZE;
    const sctx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;

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

  return {
    photoCanvasRef,
    veilCanvasRef,
    photoReady,
    revealing,
    prefersReducedMotion,
    resolvedVeilColor,
    completeReveal,
    eraseWithPath,
    eraseStroke,
  };
}
