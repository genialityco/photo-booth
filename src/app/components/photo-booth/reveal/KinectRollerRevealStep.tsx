"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  acquireKinectRoller,
  subscribeKinectFrame,
  subscribeKinectStatus,
  type KinectConnectionStatus,
} from "./kinectRollerStore";
import { FADE_OUT_MS, type Point, useRevealVeil } from "@/app/components/photo-booth/reveal/useRevealVeil";
import RollerCursor, {
  ROLLER_HEAD_WIDTH_RATIO,
  ROLLER_VIEW_SIZE,
  type RollerCursorHandle,
} from "@/app/components/photo-booth/reveal/RollerCursor";
import { getAspectClassName, getRevealBoxWidthCss, type PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";

// Mismas constantes/lógica de trazo y suavizado que RollerRevealStep.tsx (la
// versión de producción, webcam + ONNX) - ver ahí para el razonamiento
// completo. Acá solo cambia la FUENTE de la posición (WebSocket del Kinect
// en vez de detección de cámara) y que solo se PINTA mientras `touching`.
//
// El ancho del trazo (en X) es CONSTANTE, del tamaño del rodillo virtual
// (ROLLER_VIEW_SIZE * ROLLER_HEAD_WIDTH_RATIO) - no varía según el ancho
// que el backend detecte cuadro a cuadro (con require_shape_match:false esa
// medida puede fluctuar bastante según qué blob se detecte cada vez).
const ROLLER_STROKE_THICKNESS_RATIO = 0.28;
const STROKE_LENGTH_SCALE = 0.5;
const EASE_FACTOR = 0.45;
const MIN_PAINT_MOVE = 0.6;
const COAST_DURATION_MS = 900;
const VELOCITY_SMOOTHING = 0.3;
const VELOCITY_DECAY_PER_SEC = 0.15;

type DetectionTarget = { x: number; y: number; touching: boolean };

function stampRollerAt(ctx: CanvasRenderingContext2D, center: Point, length: number, thickness: number) {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.beginPath();
  const roundRect = (ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void })
    .roundRect;
  if (typeof roundRect === "function") {
    roundRect.call(ctx, -length / 2, -thickness / 2, length, thickness, thickness / 2);
  } else {
    ctx.rect(-length / 2, -thickness / 2, length, thickness);
  }
  ctx.fill();
  ctx.restore();
}

const STATUS_LABEL: Record<KinectConnectionStatus, string> = {
  idle: "Desconectado",
  connecting: "Conectando...",
  open: "Conectado",
  closed: "Conexión cerrada, reintentando...",
  error: "Error de conexión, reintentando...",
};

/**
 * Revelado por rodillo REAL: la posición viene del backend Python del Kinect
 * (kinect-roller-backend/, WebSocket) en vez de detección por cámara+ONNX
 * (RollerRevealStep.tsx). Pensado para la pantalla gigante (BoothMirror con
 * revealEffect="KINECT_ROLLER") pero también lo usa /test/rodillo-reveal
 * para probar el backend contra una imagen de muestra sin pasar por todo el
 * flujo del wizard.
 */
export default function KinectRollerRevealStep({
  wsUrl,
  aiUrl,
  aspectRatio,
  onRevealed,
  showStatus = true,
}: {
  wsUrl: string;
  aiUrl: string;
  aspectRatio?: PhotoAspectRatio;
  onRevealed: () => void;
  /** Oculta la etiqueta de estado de conexión / última lectura (útil en la
   * pantalla gigante, donde no aporta nada al público). Visible por defecto
   * para la ruta de prueba. */
  showStatus?: boolean;
}) {
  const {
    photoCanvasRef,
    veilCanvasRef,
    revealing,
    prefersReducedMotion,
    completeReveal,
    eraseWithPath,
    canvasWidth,
    canvasHeight,
  } = useRevealVeil({
    aiUrl,
    enableFrame: false,
    aspectRatio,
    onRevealed,
  });

  const rollerCursorRef = useRef<RollerCursorHandle | null>(null);
  const lastPaintPointRef = useRef<Point | null>(null);
  const targetRef = useRef<DetectionTarget | null>(null);
  const easedPosRef = useRef<{ x: number; y: number } | null>(null);
  const velocityRef = useRef({ vx: 0, vy: 0 });
  const lastTickPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTickTimeRef = useRef<number | null>(null);
  const coastStartedAtRef = useRef<number | null>(null);

  const [wsStatus, setWsStatus] = useState<KinectConnectionStatus>("idle");
  const [lastFrame, setLastFrame] = useState<{ touching: boolean; normX: number; normY: number } | null>(null);

  const SIZE_IMG = getRevealBoxWidthCss(aspectRatio);

  const eraseRollerStroke = React.useCallback(
    (from: Point | null, to: Point, length: number, thickness: number) => {
      eraseWithPath((ctx) => {
        if (!from) {
          stampRollerAt(ctx, to, length, thickness);
          return;
        }
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.floor(dist / (thickness * 0.5)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          stampRollerAt(ctx, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, length, thickness);
        }
      });
    },
    [eraseWithPath],
  );

  // === Conexión compartida al backend del Kinect ===
  useEffect(() => {
    return acquireKinectRoller(wsUrl);
  }, [wsUrl]);

  useEffect(() => {
    return subscribeKinectStatus(setWsStatus);
  }, []);

  // === Frames del Kinect: solo actualizan el objetivo; el loop de abajo
  // (60fps) hace la interpolación/pintado, igual que en producción. ===
  useEffect(() => {
    const unsubscribe = subscribeKinectFrame((frame) => {
      setLastFrame(frame.visible ? { touching: frame.touching, normX: frame.normX, normY: frame.normY } : null);
      targetRef.current = frame.visible
        ? { x: frame.screenX, y: frame.screenY, touching: frame.touching }
        : null;
    });
    return unsubscribe;
  }, []);

  // === Loop a 60fps: interpola hacia el último objetivo y pinta SOLO
  // mientras touching=true (a diferencia de la versión webcam+ONNX, acá sí
  // hay una señal real de "está apoyado" gracias a la profundidad del
  // Kinect, así que se aprovecha en vez de pintar con solo "está visible"). ===
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const now = performance.now();
      const target = targetRef.current;
      const veil = veilCanvasRef.current;
      let pos: { x: number; y: number } | null = null;
      let touching = false;

      if (target) {
        if (!easedPosRef.current) {
          easedPosRef.current = { x: target.x, y: target.y };
        } else {
          easedPosRef.current.x += (target.x - easedPosRef.current.x) * EASE_FACTOR;
          easedPosRef.current.y += (target.y - easedPosRef.current.y) * EASE_FACTOR;
        }
        pos = easedPosRef.current;
        touching = target.touching;

        if (lastTickTimeRef.current !== null && lastTickPosRef.current) {
          const dt = now - lastTickTimeRef.current;
          if (dt > 0) {
            const instVx = (pos.x - lastTickPosRef.current.x) / dt;
            const instVy = (pos.y - lastTickPosRef.current.y) / dt;
            velocityRef.current.vx += (instVx - velocityRef.current.vx) * VELOCITY_SMOOTHING;
            velocityRef.current.vy += (instVy - velocityRef.current.vy) * VELOCITY_SMOOTHING;
          }
        }
        lastTickPosRef.current = { x: pos.x, y: pos.y };
        lastTickTimeRef.current = now;
        coastStartedAtRef.current = null;
      } else if (easedPosRef.current) {
        if (coastStartedAtRef.current === null) coastStartedAtRef.current = now;
        const coastingFor = now - coastStartedAtRef.current;

        if (coastingFor <= COAST_DURATION_MS) {
          const dt = lastTickTimeRef.current !== null ? now - lastTickTimeRef.current : 16;
          const decay = Math.pow(VELOCITY_DECAY_PER_SEC, dt / 1000);
          velocityRef.current.vx *= decay;
          velocityRef.current.vy *= decay;
          easedPosRef.current.x += velocityRef.current.vx * dt;
          easedPosRef.current.y += velocityRef.current.vy * dt;
          easedPosRef.current.x = Math.min(window.innerWidth, Math.max(0, easedPosRef.current.x));
          easedPosRef.current.y = Math.min(window.innerHeight, Math.max(0, easedPosRef.current.y));
          lastTickTimeRef.current = now;
          pos = easedPosRef.current;
        } else {
          easedPosRef.current = null;
          lastPaintPointRef.current = null;
          lastTickPosRef.current = null;
          lastTickTimeRef.current = null;
          velocityRef.current = { vx: 0, vy: 0 };
          coastStartedAtRef.current = null;
        }
      }

      if (!pos) {
        lastPaintPointRef.current = null;
        rollerCursorRef.current?.setTransform(0, 0, false);
        rafId = requestAnimationFrame(tick);
        return;
      }

      rollerCursorRef.current?.setTransform(pos.x, pos.y, true);

      const rect = veil?.getBoundingClientRect();
      const outOfBox =
        !rect || rect.width === 0 || rect.height === 0 || pos.x < rect.left || pos.x > rect.right || pos.y < rect.top || pos.y > rect.bottom;

      if (outOfBox || !touching) {
        // Fuera de la foto, o el rodillo está en el aire (no tocando): se
        // mueve el cursor pero no se pinta, y se corta el trazo para no
        // unir el próximo punto pintado con este.
        lastPaintPointRef.current = null;
      } else if (rect) {
        const point = {
          x: ((pos.x - rect.left) / rect.width) * canvasWidth,
          y: ((pos.y - rect.top) / rect.height) * canvasHeight,
        };

        const last = lastPaintPointRef.current;
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= MIN_PAINT_MOVE) {
          const canvasUnitsPerPx = canvasWidth / rect.width;
          const length = ROLLER_VIEW_SIZE * ROLLER_HEAD_WIDTH_RATIO * canvasUnitsPerPx * STROKE_LENGTH_SCALE;
          const thickness = length * ROLLER_STROKE_THICKNESS_RATIO;

          eraseRollerStroke(last, point, length, thickness);
          lastPaintPointRef.current = point;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [eraseRollerStroke, veilCanvasRef, canvasWidth, canvasHeight]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden">
      <div className="absolute top-[5%] z-20 bg-black/40 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-lg shadow-black/20 flex flex-col items-center gap-1">
        <p className="text-center text-white font-semibold drop-shadow-sm" style={{ fontSize: "clamp(0.95rem, 2.6vmin, 1.25rem)" }}>
          Pasa el rodillo real sobre la foto para descubrirla
        </p>
        {showStatus && (
          <p className="text-center text-white/70 text-xs font-mono">
            {STATUS_LABEL[wsStatus]}
            {lastFrame
              ? ` · ${lastFrame.touching ? "TOCANDO" : "en el aire"} · x=${lastFrame.normX.toFixed(2)} y=${lastFrame.normY.toFixed(2)}`
              : " · sin detección"}
          </p>
        )}
      </div>

      <div
        className={`relative p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 ${getAspectClassName(aspectRatio)} rounded-2xl shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)]`}
        style={{ width: SIZE_IMG, maxWidth: SIZE_IMG }}
      >
        <div className="relative w-full h-full overflow-hidden rounded-xl bg-black/5">
          <canvas ref={photoCanvasRef} width={canvasWidth} height={canvasHeight} className="absolute inset-0 w-full h-full object-contain" />
          <canvas
            ref={veilCanvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              opacity: revealing ? 0 : 1,
              transition: prefersReducedMotion ? "none" : `opacity ${FADE_OUT_MS}ms ease-out`,
            }}
          />
        </div>
      </div>

      <RollerCursor ref={rollerCursorRef} />

      <button
        type="button"
        onClick={completeReveal}
        className="absolute bottom-5 left-5 z-20 bg-black/35 hover:bg-black/50 active:scale-95 backdrop-blur-sm transition-all rounded-full px-4 py-2 text-white/90 hover:text-white font-semibold shadow-lg shadow-black/20"
        style={{ fontSize: "clamp(0.8rem, 2vmin, 0.95rem)" }}
      >
        Saltar
      </button>
    </div>
  );
}
