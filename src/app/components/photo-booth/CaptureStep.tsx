"use client";

import React, { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FaSyncAlt, FaBolt } from "react-icons/fa";
import FrameCamera, { CAPTURE_HEADER_RESERVE, getCaptureBoxBottom } from "./FrameCamera";
import captureWithFrame from "./captureWithFrame";
import captureRawSquare from "./captureRawSquare";
import ShutterButton from "@/app/components/common/ShutterButton";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import CaptureViewfinderOverlay from "@/app/components/photo-booth/CaptureViewfinderOverlay";
import { getAspectDims, type PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";

/** Recorte "cover" centrado: el rectángulo más grande con la relación w:h pedida que entra en un video sourceW x sourceH. */
function coverCropSize(sourceW: number, sourceH: number, ratio?: PhotoAspectRatio | null) {
  const { w, h } = getAspectDims(ratio);
  const targetRatio = w / h;
  const sourceRatio = sourceW / sourceH;
  if (sourceRatio > targetRatio) {
    // el video es más ancho que el objetivo: el alto manda
    const targetH = sourceH;
    return { targetW: Math.round(targetH * targetRatio), targetH: Math.round(targetH) };
  }
  const targetW = sourceW;
  return { targetW: Math.round(targetW), targetH: Math.round(targetW / targetRatio) };
}

/** Ícono circular puramente decorativo (tipo flash/flip de una cámara real) — sin función, no interactivo. */
function DecorativeCameraButton({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/35 backdrop-blur-sm border border-white/30"
    >
      <Icon className="w-[45%] h-[45%] text-white/85" />
    </div>
  );
}

export default function CaptureStep({
  // 👇 sin marco por defecto
  frameSrc = null,
  mirror = true,
  onCaptured,
  buttonImage,
  buttonClickEffect,
  viewStyle = "CLASSIC",
  logoLeftSrc,
  logoRightSrc,
  backgroundSrc,
  aspectRatio,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  /** Estilo visual de la vista de captura. "CLASSIC" (default) es el actual;
   * "VIEWFINDER" agrega la guía de encuadre tipo visor de cámara. */
  viewStyle?: "CLASSIC" | "VIEWFINDER";
  /** Logos chicos en la fila inferior, a los costados del disparador. */
  logoLeftSrc?: string;
  logoRightSrc?: string;
  /** Fondo detrás del cuadro de cámara (la imagen de fondo configurada del evento). */
  backgroundSrc?: string;
  /** Relación de aspecto de la foto capturada. "SQUARE" (default) = comportamiento original. Solo aplica cuando no hay marco (el marco manda su propia forma). */
  aspectRatio?: PhotoAspectRatio;
  onCaptured: (payload: { framed: string; raw: string }) => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // --- Solo se usan si activas marco ---
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [frameReady, setFrameReady] = useState(false);

  const [videoReady, setVideoReady] = useState(false);

  // Recibe el <video> desde FrameCamera
  const onReady = ({
    getVideoEl,
  }: {
    getVideoEl: () => HTMLVideoElement | null;
  }) => {
    const v = getVideoEl();
    videoElRef.current = v || null;
    if (v) {
      const mark = () => setVideoReady(true);
      if (v.readyState >= 2 /* HAVE_CURRENT_DATA */) mark();
      else v.addEventListener("loadedmetadata", mark, { once: true });
    }
  };

  // --- Precarga de marco ---
  useEffect(() => {
    let cancelled = false;

    if (!frameSrc) {
      setFrameReady(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = frameSrc;

        await img.decode();
        if (cancelled) return;

        frameImgRef.current = img;
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        setFrameSize({ w, h });
        setFrameReady(true);
        console.log("Frame loaded successfully:", { w, h, src: frameSrc });
      } catch (error) {
        console.warn("Error loading frame with decode():", error);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = frameSrc;
        img.onload = () => {
          if (cancelled) return;
          frameImgRef.current = img;
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          setFrameSize({ w, h });
          setFrameReady(true);
          console.log("Frame loaded successfully (fallback):", {
            w,
            h,
            src: frameSrc,
          });
        };
        img.onerror = () => {
          console.error("Failed to load frame image:", frameSrc);
          setFrameReady(true); // Continúa sin marco
        };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [frameSrc]);

  // 👇 Con marco: videoReady && frameReady && !!frameSize (o sin marco: solo videoReady)
  const canShoot = frameSrc
    ?  frameReady
    : videoReady;

  // Mantiene el valor más reciente de canShoot sin depender de closures viejas,
  // necesario para el reintento de startCapture cuando la cámara aún está iniciando.
  const canShootRef = useRef(canShoot);
  useEffect(() => {
    canShootRef.current = canShoot;
  }, [canShoot]);

  const beginCountdown = () => {
    setCountdown(3);
    const tick = () =>
      setCountdown((c) => {
        if (c === null) return c;
        if (c <= 1) {
          setCountdown(null);
          void doCapture();
          return null;
        }
        return c - 1;
      });
    setTimeout(tick, 1000);
    setTimeout(tick, 2000);
    setTimeout(tick, 3000);
  };

  // Cuando el evento tiene una sola brand, la app salta la pantalla de selección
  // y llega directo a Capture, por lo que el usuario puede tocar el disparador
  // antes de que la cámara termine de inicializar (canShoot aún en false).
  // En vez de ignorar el click, esperamos un poco a que la cámara esté lista.
  const startCapture = (attempt = 0) => {
    if (!canShootRef.current) {
      if (attempt >= 50) {
        console.warn("La cámara no estuvo lista a tiempo; se continúa igual.");
        beginCountdown();
        return;
      }
      setTimeout(() => startCapture(attempt + 1), 100);
      return;
    }
    beginCountdown();
  };

  const doCapture = async () => {
    const video = videoElRef.current;
    if (!video) return;

    let framed: string;

    if (frameSrc && frameSize && frameImgRef.current) {
      // --- Con marco ---
      const { w, h } = frameSize;
      const frameImg = frameImgRef.current;
      framed = captureWithFrame({
        video,
        frame: frameImg,
        targetW: w,
        targetH: h,
        mirror,
      });
      console.log("Capture with frame:", { w, h });
    } else {
      // --- Sin marco ---
      const { targetW, targetH } = coverCropSize(
        video.videoWidth || 1080,
        video.videoHeight || 1080,
        aspectRatio,
      );

      framed = captureWithFrame({
        video,
        frame: null,
        targetW,
        targetH,
        mirror,
      });
      console.log("Capture without frame");
    }

    // Raw siempre es sin marco
    const { targetW: rawW, targetH: rawH } = coverCropSize(
      video.videoWidth || 1080,
      video.videoHeight || 1080,
      aspectRatio,
    );
    const raw = captureRawSquare({ video, targetW: rawW, targetH: rawH, mirror });

    setFlash(true);
    setTimeout(() => setFlash(false), 120);

    onCaptured({ framed, raw });
  };

  return (
    <div className="fixed inset-0 z-30 overflow-hidden">
      <FrameCamera
        frameSrc={frameSrc ?? undefined} // 👈 si es null no renderiza <img>
        mirror={mirror}
        backgroundSrc={backgroundSrc}
        aspectRatio={aspectRatio}
        onReady={onReady}
      >
        {viewStyle === "VIEWFINDER" && <CaptureViewfinderOverlay />}
      </FrameCamera>

      {/* Header: los dos logos del evento, a los costados, con buen tamaño.
          Banda de alto fijo (misma reserva que usa FrameCamera para saber
          dónde arranca el cuadro de cámara) — acá sí conviene fijo, porque
          a diferencia de la barra inferior no depende de cuánto sobre. */}
      <div
        /* Con los dos logos van uno a cada lado; con uno solo va centrado
           (antes un <span/> vacío de relleno lo dejaba pegado a un costado). */
        className={`absolute top-0 left-0 right-0 z-20 flex items-center px-6 sm:px-10 pt-[env(safe-area-inset-top)] pointer-events-none ${
          logoLeftSrc && logoRightSrc ? "justify-between" : "justify-center"
        }`}
        style={{ height: CAPTURE_HEADER_RESERVE }}
      >
        {logoLeftSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoLeftSrc}
            alt=""
            className="h-[clamp(2.5rem,50%,4rem)] w-auto max-w-[35vw] object-contain select-none"
            draggable={false}
          />
        ) : null}
        {logoRightSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoRightSrc}
            alt=""
            className="h-[clamp(2.5rem,50%,4rem)] w-auto max-w-[35vw] object-contain select-none"
            draggable={false}
          />
        ) : null}
      </div>

      <AnimatePresence>
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Halo pulsante detrás del número */}
            <motion.div
              key={`glow-${countdown}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.55, scale: 1.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="absolute rounded-full blur-2xl bg-white/70"
              style={{ width: "40vmin", height: "40vmin" }}
            />
            <motion.div
              key={countdown}
              initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
              className="font-azo font-black text-white leading-none select-none"
              style={{
                fontSize: "clamp(6rem, 24vw, 15rem)",
                textShadow:
                  "0 0 40px rgba(255,255,255,0.65), 0 8px 24px rgba(0,0,0,0.55)",
                WebkitTextStroke: "2px rgba(0,0,0,0.15)",
              }}
            >
              {countdown}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {flash && (
        <div className="absolute inset-0 bg-white/80 animate-pulse pointer-events-none" />
      )}

      {/* Fila inferior: botón decorativo — disparador — botón decorativo.
          Arranca justo donde termina el cuadro de cámara (CAPTURE_SQUARE_BOTTOM,
          misma cuenta que usa FrameCamera) y se centra verticalmente en lo
          que sobre hasta el borde real de la pantalla — así queda "pegada"
          a la cámara en vez de perdida en un espacio de relleno grande en
          pantallas donde el cuadro no llega a ocupar todo el alto (ej. un
          iPad). El grid de 3 columnas mantiene el disparador perfectamente
          centrado. Los botones de los costados son solo decorativos (tipo
          flip/flash de una cámara real) — no tienen ninguna función. */}
      <div
        className="absolute left-0 right-0 bottom-0 z-20 flex items-center justify-center pb-[env(safe-area-inset-bottom)] px-6 sm:px-10"
        style={{ top: getCaptureBoxBottom(aspectRatio) }}
      >
        <div className="grid grid-cols-3 items-center w-full h-full py-2">
          <div className="flex justify-start items-center h-full">
            <DecorativeCameraButton icon={FaSyncAlt} />
          </div>
          <div className="flex justify-center items-center h-full">
            <ShutterButton
              onClick={() => startCapture()}
              imageSrc={buttonImage}
              clickEffect={buttonClickEffect}
            />
          </div>
          <div className="flex justify-end items-center h-full">
            <DecorativeCameraButton icon={FaBolt} />
          </div>
        </div>
      </div>
    </div>
  );
}
