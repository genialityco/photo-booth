"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  acquireHandTracking,
  getHandTrackingStream,
  subscribeHandFrame,
  subscribeHandTrackingStatus,
} from "@/app/components/common/hand-cursor/handTrackingStore";
import { CANVAS_SIZE, FADE_OUT_MS, type Point, useRevealVeil } from "@/app/components/photo-booth/reveal/useRevealVeil";
import RollerCursor, {
  ROLLER_HEAD_CENTER_Y_RATIO,
  ROLLER_HEAD_WIDTH_RATIO,
  ROLLER_OFFSET_Y,
  ROLLER_VIEW_SIZE,
  type RollerCursorHandle,
} from "@/app/components/photo-booth/reveal/RollerCursor";

// Franja horizontal que deja el cabezal del rodillo al pasar (el rodillo
// tiene orientación fija, así que la franja también es siempre horizontal).
const ROLLER_STROKE_THICKNESS_RATIO = 0.35; // relativo al ancho del cabezal
// Corrección fina (px) del punto de pintura respecto al cálculo geométrico:
// negativo = sube el punto (más cerca del cabezal visible).
const PAINT_POINT_Y_CORRECTION_PX = -50;

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

export default function RollerRevealStep({
  aiUrl,
  videoUrl,
  frameSrc = null,
  enableFrame = true,
  revealColorHint = null,
  veilMode = "SOLID",
  handTrackingEnabled = false,
  onRevealed,
}: {
  aiUrl: string;
  videoUrl?: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  revealColorHint?: string | null;
  /** "SOLID" (default): velo de color plano, revela la foto de un tirón.
   * "GRAYSCALE_PHOTO": la foto arranca en blanco y negro y el rodillo va
   * pintando el color encima. */
  veilMode?: "SOLID" | "GRAYSCALE_PHOTO";
  /** Activa la cámara para mover el rodillo con la mano. Si es false, solo se usa el fallback táctil. */
  handTrackingEnabled?: boolean;
  onRevealed: () => void;
}) {
  const {
    photoCanvasRef,
    veilCanvasRef,
    revealing,
    prefersReducedMotion,
    completeReveal,
    eraseWithPath,
  } = useRevealVeil({ aiUrl, videoUrl, frameSrc, enableFrame, revealColorHint, veilMode, onRevealed });

  const selfViewRef = useRef<HTMLVideoElement | null>(null);
  const rollerCursorRef = useRef<RollerCursorHandle | null>(null);
  const lastPaintPointRef = useRef<Point | null>(null); // coordenadas locales del canvas
  const lastPointerPointRef = useRef<Point | null>(null);
  const pointerActiveRef = useRef(false);

  const [handTrackingReady, setHandTrackingReady] = useState(false);
  const [handTrackingError, setHandTrackingError] = useState(false);

  const SIZE_IMG = "clamp(300px, min(70vw, 60svh), 700px)";

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

  // === Reserva el tracking de mano compartido (misma cámara que el cursor
  // global si ya está corriendo; si no, arranca una sola para esta pantalla).
  // Solo si el evento lo habilita explícitamente (handRevealEnabled): en el
  // celular personal del asistente la cámara frontal no ve una mano estable
  // y el "cursor" termina parpadeando y saltando de posición. ===
  useEffect(() => {
    if (!handTrackingEnabled) return;
    return acquireHandTracking();
  }, [handTrackingEnabled]);

  // === Estado del tracking compartido: listo/error, y conecta el self-view
  // a la MISMA MediaStream (sin pedir una segunda cámara) ===
  useEffect(() => {
    if (!handTrackingEnabled) return;
    const unsubscribe = subscribeHandTrackingStatus((status) => {
      if (status === "ready") {
        setHandTrackingReady(true);
        setHandTrackingError(false);
        const stream = getHandTrackingStream();
        if (stream && selfViewRef.current) {
          selfViewRef.current.srcObject = stream;
          selfViewRef.current.play().catch(() => {});
        }
      } else if (status === "error") {
        setHandTrackingError(true);
      }
    });
    return unsubscribe;
  }, [handTrackingEnabled]);

  // === Frames del tracking compartido: mueve el rodillo 3D (el mango queda
  // anclado a la mano) y pinta usando la posición y el tamaño REALES del
  // cabezal del rodillo — no de la mano — para que se note que es el
  // rodillo el que pinta. Alcanza con pasarlo sobre la imagen, sin gesto. ===
  useEffect(() => {
    if (!handTrackingReady) return;

    const unsubscribe = subscribeHandFrame((frame) => {
      const veil = veilCanvasRef.current;
      if (!veil) return;

      if (!frame.visible) {
        lastPaintPointRef.current = null;
        rollerCursorRef.current?.setTransform(0, 0, false);
        return;
      }

      rollerCursorRef.current?.setTransform(frame.screenX, frame.screenY, true);

      const rect = veil.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // El mango está anclado a la mano (frame.screenX/Y) + ROLLER_OFFSET_Y;
      // el cabezal del rodillo queda fijo por encima de esa posición.
      const headScreenX = frame.screenX;
      const headScreenY =
        frame.screenY +
        ROLLER_OFFSET_Y -
        ROLLER_VIEW_SIZE * (1 - ROLLER_HEAD_CENTER_Y_RATIO) +
        PAINT_POINT_Y_CORRECTION_PX;

      const ratioX = Math.min(1, Math.max(0, (headScreenX - rect.left) / rect.width));
      const ratioY = Math.min(1, Math.max(0, (headScreenY - rect.top) / rect.height));
      const point = { x: ratioX * CANVAS_SIZE, y: ratioY * CANVAS_SIZE };

      // Ancho real del cabezal en pantalla -> convertido a unidades del canvas.
      const canvasUnitsPerPx = CANVAS_SIZE / rect.width;
      const headWidthPx = ROLLER_VIEW_SIZE * ROLLER_HEAD_WIDTH_RATIO;
      const length = headWidthPx * canvasUnitsPerPx;
      const thickness = length * ROLLER_STROKE_THICKNESS_RATIO;

      eraseRollerStroke(lastPaintPointRef.current, point, length, thickness);
      lastPaintPointRef.current = point;
    });

    return unsubscribe;
  }, [handTrackingReady, eraseRollerStroke, veilCanvasRef]);

  // === Fallback táctil: tocar/arrastrar sobre el velo también pinta con el rodillo ===
  const pointToCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return { x: nx * CANVAS_SIZE, y: ny * CANVAS_SIZE };
  };

  const touchStrokeSize = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasUnitsPerPx = CANVAS_SIZE / rect.width;
    const length = ROLLER_VIEW_SIZE * ROLLER_HEAD_WIDTH_RATIO * canvasUnitsPerPx;
    return { length, thickness: length * ROLLER_STROKE_THICKNESS_RATIO };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerActiveRef.current = true;
    const p = pointToCanvas(e);
    const { length, thickness } = touchStrokeSize(e);
    eraseRollerStroke(null, p, length, thickness);
    lastPointerPointRef.current = p;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerActiveRef.current) return;
    const p = pointToCanvas(e);
    const { length, thickness } = touchStrokeSize(e);
    eraseRollerStroke(lastPointerPointRef.current, p, length, thickness);
    lastPointerPointRef.current = p;
  };

  const handlePointerUp = () => {
    pointerActiveRef.current = false;
    lastPointerPointRef.current = null;
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden">
      <div className="absolute top-[5%] z-20 bg-black/40 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-lg shadow-black/20 animate-fadeIn">
        <p
          className="text-center text-white font-semibold drop-shadow-sm"
          style={{ fontSize: "clamp(0.95rem, 2.6vmin, 1.25rem)" }}
          role="status"
          aria-live="polite"
        >
          {!handTrackingEnabled || handTrackingError
            ? "Toca y desliza la pantalla para pintar con el rodillo"
            : veilMode === "GRAYSCALE_PHOTO"
              ? "Pasa el rodillo sobre la foto para pintarla de color"
              : "Pasa el rodillo sobre la foto para descubrirla"}
        </p>
      </div>

      {/* Marco/mat + sombra en capas, igual que la foto en PreviewStep — le da
          profundidad en vez de quedar pegada al fondo. */}
      <div
        className="relative p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 aspect-square rounded-2xl shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)]"
        style={{ width: SIZE_IMG, maxWidth: SIZE_IMG }}
      >
        <div className="relative w-full h-full overflow-hidden rounded-xl bg-black/5">
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
      </div>

      {/* Self-view: misma cámara del tracking compartido, solo para ubicar la mano */}
      {handTrackingEnabled && (
        <div className="absolute bottom-5 right-5 z-20 w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-white/60 shadow-xl">
          <video
            ref={selfViewRef}
            muted
            playsInline
            autoPlay
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      )}

      {handTrackingEnabled && <RollerCursor ref={rollerCursorRef} />}

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
