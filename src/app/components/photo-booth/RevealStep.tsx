"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  acquireHandTracking,
  getHandTrackingStream,
  subscribeHandFrame,
  subscribeHandTrackingStatus,
} from "@/app/components/common/hand-cursor/handTrackingStore";
import { CANVAS_SIZE, FADE_OUT_MS, type Point, useRevealVeil } from "@/app/components/photo-booth/reveal/useRevealVeil";

export default function RevealStep({
  aiUrl,
  videoUrl,
  frameSrc = null,
  enableFrame = true,
  revealColorHint = null,
  handTrackingEnabled = false,
  onRevealed,
}: {
  aiUrl: string;
  videoUrl?: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  revealColorHint?: string | null;
  /** Activa la cámara para revelar la foto con la mano. Si es false, solo se usa el fallback táctil. */
  handTrackingEnabled?: boolean;
  onRevealed: () => void;
}) {
  const {
    photoCanvasRef,
    veilCanvasRef,
    photoReady,
    revealing,
    prefersReducedMotion,
    completeReveal,
    eraseStroke,
  } = useRevealVeil({ aiUrl, videoUrl, frameSrc, enableFrame, revealColorHint, onRevealed });

  const selfViewRef = useRef<HTMLVideoElement | null>(null);
  const lastHandPointRef = useRef<Point | null>(null);
  const lastPointerPointRef = useRef<Point | null>(null);
  const pointerActiveRef = useRef(false);

  const [handTrackingReady, setHandTrackingReady] = useState(false);
  const [handTrackingError, setHandTrackingError] = useState(false);

  const SIZE_IMG = "clamp(300px, min(70vw, 60svh), 700px)";

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

  // === Frames del tracking compartido → borra el velo en el punto exacto
  // donde se ve el cursor de mano (misma fuente que HandCursorOverlay) ===
  useEffect(() => {
    if (!handTrackingReady) return;

    const unsubscribe = subscribeHandFrame((frame) => {
      const veil = veilCanvasRef.current;
      if (!veil) return;

      if (!frame.visible) {
        lastHandPointRef.current = null;
        return;
      }

      // Convierte la posición en pantalla (misma que usa el cursor global) a
      // coordenadas locales del canvas, para que "donde se ve el cursor" sea
      // exactamente "donde se borra".
      const rect = veil.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const ratioX = Math.min(1, Math.max(0, (frame.screenX - rect.left) / rect.width));
      const ratioY = Math.min(1, Math.max(0, (frame.screenY - rect.top) / rect.height));
      const point = { x: ratioX * CANVAS_SIZE, y: ratioY * CANVAS_SIZE };

      eraseStroke(lastHandPointRef.current, point);
      lastHandPointRef.current = point;
    });

    return unsubscribe;
  }, [handTrackingReady, eraseStroke, veilCanvasRef]);

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

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden">
      <p
        className="absolute top-[6%] z-20 text-center text-white text-sm sm:text-base font-medium drop-shadow-lg px-6 animate-fadeIn"
        role="status"
        aria-live="polite"
      >
        {!handTrackingEnabled || handTrackingError
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
