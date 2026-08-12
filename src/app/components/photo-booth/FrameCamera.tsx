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

/**
 * Alto reservado arriba para el header (logos a los lados) y abajo para la
 * barra del disparador. Son valores fijos: el header SIEMPRE mide esto (no
 * hay ambigüedad ahí). El cuadro de cámara arranca justo debajo del header
 * y mide `CAPTURE_SQUARE_SIZE` — en pantallas angostas (retrato) el ancho
 * manda: min(100vw, ...) = 100vw, y las reservas de arriba/abajo no achican
 * el cuadro (solo importan en pantallas anchas donde la altura manda). Por
 * eso la barra inferior NO usa una altura fija: arranca en
 * `CAPTURE_SQUARE_BOTTOM` (donde realmente termina el cuadro) y se centra
 * en lo que quede hasta el borde real de la pantalla — así nunca queda
 * "perdida" lejos de la cámara en dispositivos donde el cuadro no llega a
 * ocupar toda la altura disponible (ej. un iPad).
 */
export const CAPTURE_HEADER_RESERVE = "7rem";
const CAPTURE_FOOTER_RESERVE = "9rem";
export const CAPTURE_SQUARE_SIZE = `min(100vw, calc(100dvh - ${CAPTURE_HEADER_RESERVE} - ${CAPTURE_FOOTER_RESERVE}))`;
export const CAPTURE_SQUARE_BOTTOM = `calc(${CAPTURE_HEADER_RESERVE} + ${CAPTURE_SQUARE_SIZE})`;

export default function FrameCamera({
  frameSrc = null,
  mirror = true,
  backgroundSrc,
  onReady,
  children,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  /** Fondo detrás del cuadro nítido (la imagen/fondo configurado del evento), en vez de un blur genérico. */
  backgroundSrc?: string;
  onReady?: (api: { getVideoEl: () => HTMLVideoElement | null }) => void;
  /** Overlay opcional (ej. guía de encuadre) renderizado DENTRO del cuadro nítido, en el mismo tamaño/posición. */
  children?: React.ReactNode;
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
            // Reducir resolución inicial - muchos móviles fallan con resoluciones forzadas, ideal 1080
            width: { ideal: 1080 },
            height: { ideal: 1080 },
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
            const el = videoRef.current;
            if (!el) {
              resolve();
              return;
            }
            if (el.readyState >= 1 /* HAVE_METADATA */) {
              resolve();
              return;
            }
            // addEventListener (no `.onloadedmetadata =`) para no pisar el
            // handler que CaptureStep registra para saber cuándo puede disparar.
            el.addEventListener("loadedmetadata", () => resolve(), { once: true });
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

  const mirrorTransform = mirror ? "scaleX(-1)" : "none";

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Fondo: la imagen de fondo configurada del evento (la misma que se
          usa en el resto del wizard), para que se sienta a pantalla
          completa y con la marca del evento en vez de un blur genérico. */}
      {backgroundSrc && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={backgroundSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover select-none"
          draggable={false}
          aria-hidden
        />
      )}

      {/* Cuadro nítido: esto es exactamente lo que se captura (ver
          captureWithFrame/captureRawSquare, que recortan el cuadrado
          central del video nativo sin importar cómo se ve en pantalla).
          Anclado justo debajo del header (no centrado verticalmente) para
          que la cámara ocupe todo el espacio disponible entre el header y
          la barra inferior, en vez de dejar relleno difuminado repartido. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 aspect-square shadow-[0_0_40px_rgba(0,0,0,0.5)]"
        style={{ top: CAPTURE_HEADER_RESERVE, width: CAPTURE_SQUARE_SIZE, maxWidth: CAPTURE_SQUARE_SIZE }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: mirrorTransform }}
          playsInline
          autoPlay
          muted
        />

        {/* Esquinas de encuadre: guía base, siempre presente, marca
            exactamente el área que se captura. */}
        <span className="absolute top-4 left-4 w-7 h-7 border-t-2 border-l-2 border-white/70 rounded-tl-md pointer-events-none" />
        <span className="absolute top-4 right-4 w-7 h-7 border-t-2 border-r-2 border-white/70 rounded-tr-md pointer-events-none" />
        <span className="absolute bottom-4 left-4 w-7 h-7 border-b-2 border-l-2 border-white/70 rounded-bl-md pointer-events-none" />
        <span className="absolute bottom-4 right-4 w-7 h-7 border-b-2 border-r-2 border-white/70 rounded-br-md pointer-events-none" />

        {/* Marco DESACTIVADO por defecto.
          Para ACTIVAR el marco, descomenta este bloque y pasa un string válido
          en `frameSrc` (ej: "/images/marco.png"). NO pases "". */}
        {/* {frameSrc && (
          <img
            src={frameSrc}
            alt="Marco"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        )} */}

        {children}
      </div>

      {error && (
        <p className="absolute inset-x-4 bottom-24 text-center text-red-400 text-sm bg-black/60 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
