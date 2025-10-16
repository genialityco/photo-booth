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
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  };
};

export default function FrameCamera({
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

  // Polyfill sin `any`
  function ensureGetUserMedia(): boolean {
    if (typeof navigator === "undefined") return false;
    const n = navigator as NavigatorWithLegacy;

    const legacy =
      n.getUserMedia || n.webkitGetUserMedia || n.mozGetUserMedia;

    if (!n.mediaDevices) {
      (n as unknown as { mediaDevices: MediaDevices }).mediaDevices = {} as MediaDevices;
    }

    const md = n.mediaDevices as MediaDevices & {
      getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
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

      const isLocalhost =
        typeof location !== "undefined" &&
        /^localhost$|^127\.0\.0\.1$/.test(location.hostname);
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

        // CAMBIO CLAVE: Configuración más compatible para móviles
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: "user",
            // Reducir resolución inicial - muchos móviles fallan con HD
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        
        // CAMBIO CLAVE: Asignar srcObject ANTES de play()
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Esperar a que el video esté listo
          await new Promise<void>((resolve) => {
            if (videoRef.current) {
              videoRef.current.onloadedmetadata = () => {
                resolve();
              };
            } else {
              resolve();
            }
          });

          // Intentar reproducir
          try {
            await videoRef.current.play();
          } catch (playError) {
            console.warn("Error al reproducir:", playError);
            // En algunos móviles, el play() puede fallar pero el video funciona igual
          }
        }
        
        setError(null);
      } catch (e) {
        console.error("Error detallado:", e);
        
        let msg = "No se pudo acceder a la cámara.";
        
        if (e instanceof Error) {
          // Mensajes más específicos según el error
          if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
            msg = "Permiso de cámara denegado. Por favor, permite el acceso en la configuración de tu navegador.";
          } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
            msg = "No se encontró ninguna cámara en este dispositivo.";
          } else if (e.name === "NotReadableError" || e.name === "TrackStartError") {
            msg = "La cámara está siendo usada por otra aplicación. Cierra otras apps y recarga la página.";
          } else if (e.name === "OverconstrainedError") {
            msg = "La configuración solicitada no es compatible con tu cámara. Intenta con otra resolución.";
          } else if (e.name === "TypeError") {
            msg = "Error de configuración. Verifica que estés usando HTTPS.";
          } else {
            msg = e.message || msg;
          }
        }
        
        setError(msg);
      }
    };

    void start();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
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
          // NUEVO: webkit-playsinline para iOS viejos
          {...({ "webkit-playsinline": "" } as any)}
        />

        {frameSrc && (
          <img
            src={frameSrc}
            alt="Marco"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        )}
      </div>

      {error && <p className="text-red-500 text-sm text-center px-3">{error}</p>}
    </div>
  );
}