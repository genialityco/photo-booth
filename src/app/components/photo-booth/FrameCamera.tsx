"use client";

import React, { useEffect, useRef, useState } from "react";

// Tipos para navegadores con APIs legacy
type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (err: unknown) => void
) => void;

type NavigatorWithLegacy = Navigator & {
  webkitGetUserMedia?: LegacyGetUserMedia;
  mozGetUserMedia?: LegacyGetUserMedia;
  getUserMedia?: LegacyGetUserMedia;
  mediaDevices?: MediaDevices & {
    getUserMedia?: (
      constraints: MediaStreamConstraints
    ) => Promise<MediaStream>;
  };
};

export default function FrameCamera({
  // sin marco por defecto
  frameSrc = "", // "/congresoEdu/MARCO_CONGRESO-DE-EDUACION_FINAL.png",
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  width = "100vw",
  height = "80vh",
  onReady,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  width?: string;
  height?: string;
  onReady?: (api: { getVideoEl: () => HTMLVideoElement | null }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<"720p" | "1080p" | "4k">("1080p");
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Obtener dimensiones según la resolución seleccionada
  const getResolutionDimensions = (res: "720p" | "1080p" | "4k") => {
    switch (res) {
      case "720p":
        return { width: 1280, height: 720 };
      case "1080p":
        return { width: 1920, height: 1080 };
      case "4k":
        return { width: 3840, height: 2160 };
    }
  };

  // Polyfill sin `any`
  function ensureGetUserMedia(): boolean {
    if (typeof navigator === "undefined") return false;
    const n = navigator as NavigatorWithLegacy;

    const legacy = n.getUserMedia || n.webkitGetUserMedia || n.mozGetUserMedia;

    if (!n.mediaDevices) {
      // Creamos el objeto mediaDevices de forma segura sin usar `any`
      (n as unknown as { mediaDevices: MediaDevices }).mediaDevices =
        {} as MediaDevices;
    }

    const md = n.mediaDevices as MediaDevices & {
      getUserMedia?: (
        constraints: MediaStreamConstraints
      ) => Promise<MediaStream>;
    };

    if (!md.getUserMedia && legacy) {
      md.getUserMedia = (constraints: MediaStreamConstraints) =>
        new Promise<MediaStream>((resolve, reject) => {
          legacy.call(n, constraints, resolve, reject);
        });
    }

    return typeof md.getUserMedia === "function";
  }

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      if (typeof window === "undefined") return;

      // (Opcional) Si prefieres intentar siempre y capturar el error en catch, puedes comentar este bloque:
      const isLocalhost =
        typeof location !== "undefined" &&
        /^localhost$|^127\.0\.0\.1$/.test(location.hostname);
      if (window.isSecureContext === false && !isLocalhost) {
        setError(
          "La cámara requiere HTTPS (o localhost). Abre el sitio en https:// o usa localhost."
        );
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

        const { width: resWidth, height: resHeight } = getResolutionDimensions(resolution);

        const stream = await ( 
          navigator.mediaDevices as MediaDevices
        ).getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: resWidth },
            height: { ideal: resHeight },
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          
          // Log de la resolución real obtenida
          const videoTrack = stream.getVideoTracks()[0];
          const settings = videoTrack.getSettings();
          console.log("Camera resolution:", {
            width: settings.width,
            height: settings.height,
            aspectRatio: settings.aspectRatio,
            deviceId: settings.deviceId
          });
        }
        setError(null);
      } catch (e) {
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
  }, [resolution]);

  useEffect(() => {
    onReady?.({ getVideoEl: () => videoRef.current });
  }, [onReady]);


  return (
    <div className="w-full flex flex-col items-center justify-center gap-2">
      <div
        className={`relative overflow-hidden shadow-2xl`}
        style={{ 
          width: width || boxSize, 
          height: height || boxSize 
        }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            transform: mirror ? "scaleX(-1)" : "none"
          }}
          playsInline
          autoPlay
          muted
        />

        {/* Botón de resolución */}
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={() => setShowResolutionMenu(!showResolutionMenu)}
            className="bg-black/50 hover:bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-sm transition-colors"
            aria-label="Cambiar resolución"
          >
            {resolution}
          </button>
          
          {showResolutionMenu && (
            <div className="absolute top-full right-0 mt-1 bg-black/80 backdrop-blur-sm rounded shadow-lg overflow-hidden">
              {(["720p", "1080p", "4k"] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => {
                    setResolution(res);
                    setShowResolutionMenu(false);
                  }}
                  className={`block w-full text-left px-3 py-2 text-xs text-white hover:bg-white/20 transition-colors ${
                    resolution === res ? "bg-white/10" : ""
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────
          Marco DESACTIVADO por defecto.
          Para ACTIVAR el marco, descomenta este bloque y pasa un string válido
          en `frameSrc` (ej: "/images/marco.png"). NO pases "".
          ───────────────────────────────────────────────────────────────── */}

        {/* {frameSrc && (
          <img
            src={frameSrc}
            alt="Marco"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        )} */}
      </div>

      {error && (
        <p className="text-red-500 text-sm text-center px-3">{error}</p>
      )}
    </div>
  );
}
