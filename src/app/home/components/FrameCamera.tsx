/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";

export default function FrameCamera({
  // sin marco por defecto
  frameSrc = null,
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  onReady,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  onReady?: (api: { getVideoEl: () => HTMLVideoElement | null }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Polyfill seguro para browsers antiguos
  function ensureGetUserMedia(): boolean {
    if (typeof navigator === "undefined") return false;
    // @ts-expect-error legacy vendors
    const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (!navigator.mediaDevices) (navigator as any).mediaDevices = {};
    if (!navigator.mediaDevices.getUserMedia && legacy) {
      (navigator.mediaDevices as any).getUserMedia = (constraints: MediaStreamConstraints) =>
        new Promise<MediaStream>((resolve, reject) => {
          legacy.call(navigator, constraints, resolve, reject);
        });
    }
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
  }

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      if (typeof window === "undefined") return;

      // Puedes comentar este bloque si prefieres intentar siempre y capturar el error en catch:
      const isLocalhost =
        typeof location !== "undefined" && /^localhost$|^127\.0\.0\.1$/.test(location.hostname);
      if (window.isSecureContext === false && !isLocalhost) {
        setError("La cámara requiere HTTPS (o localhost). Abre el sitio en https:// o usa localhost.");
        return;
      }

      const hasGUM = ensureGetUserMedia();
      if (!hasGUM) {
        setError("getUserMedia no está disponible en este navegador/entorno.");
        return;
      }

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

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { });
        }
        setError(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || "No se pudo acceder a la cámara.");
      }
    };

    void start();

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
    <div className="w-full flex flex-col items-center justify-center gap-2">
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

        {/*
          ─────────────────────────────────────────────────────────────────
          Marco DESACTIVADO por defecto.
          Para ACTIVAR el marco, descomenta este bloque y asegúrate de pasar
          un string válido en `frameSrc` (ej: "/images/marco.png").
          NO pases "", usa null para "sin marco".
          ─────────────────────────────────────────────────────────────────

        {frameSrc && (
          <img
            src={frameSrc}
            alt="Marco"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        )}
        */}
      </div>

      {error && <p className="text-red-500 text-sm text-center px-3">{error}</p>}
    </div>
  );
}
