/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Cámara cuadrada, video recortado dentro del marco (cuadrado), espejo en preview.
 * Solo frontal (sin botón de cambio).
 */
export default function FrameCamera({
  frameSrc = "/images/marco.png",
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  onReady,
}: {
  frameSrc?: string;
  mirror?: boolean;
  boxSize?: string;
  onReady?: (api: { getVideoEl: () => HTMLVideoElement | null }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!mounted) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setError(null);
      } catch (e: any) {
        setError(e?.message || "No se pudo acceder a la cámara.");
      }
    };
    start();
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    onReady?.({ getVideoEl: () => videoRef.current });
  }, [onReady]);

  return (
    <div className="w-full flex items-center justify-center">
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: boxSize, height: boxSize }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: mirror ? "scaleX(-1)" : "none" }}
          playsInline
          autoPlay
          muted
        />
        <img
          src={frameSrc}
          alt="Marco"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
