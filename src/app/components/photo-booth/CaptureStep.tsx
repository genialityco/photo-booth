"use client";

import React, { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import FrameCamera from "./FrameCamera";
import captureWithFrame from "./captureWithFrame";
import captureRawSquare from "./captureRawSquare";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import CaptureViewfinderOverlay from "@/app/components/photo-booth/CaptureViewfinderOverlay";

export default function CaptureStep({
  // 👇 sin marco por defecto
  frameSrc = null,
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  borderRadius = "xl",
  onCaptured,
  buttonImage,
  buttonClickEffect,
  viewStyle = "CLASSIC",
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  borderRadius?: "none" | "md" | "lg" | "xl" | "4xl";
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  /** Estilo visual de la vista de captura. "CLASSIC" (default) es el actual;
   * "VIEWFINDER" agrega la guía de encuadre tipo visor de cámara. */
  viewStyle?: "CLASSIC" | "VIEWFINDER";
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
  // y llega directo a Capture, por lo que el usuario puede tocar "TOMAR FOTO"
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
      const square = Math.min(
        video.videoWidth || 1080,
        video.videoHeight || 1080,
      );
      const targetW = square;
      const targetH = square;

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
    const square = Math.min(
      video.videoWidth || 1080,
      video.videoHeight || 1080,
    );
    const raw = captureRawSquare({ video, targetW: square, targetH: square, mirror });

    setFlash(true);
    setTimeout(() => setFlash(false), 120);

    onCaptured({ framed, raw });
  };
  const borderRadiusClass = {
    none: "",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-2xl",
    "4xl": "rounded-4xl"
  }[borderRadius];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 sm:gap-2 overflow-hidden  sm:px-3">
      <div className={`relative flex-1 flex items-center justify-center w-full overflow-hidden ${borderRadiusClass}`}>
        <FrameCamera
          frameSrc={frameSrc ?? undefined} // 👈 si es null no renderiza <img>
          mirror={mirror}
          boxSize={boxSize}

          onReady={onReady}
        />
        {viewStyle === "VIEWFINDER" && <CaptureViewfinderOverlay />}
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

      <div className="flex-shrink-0">
        <ButtonPrimary
          onClick={() => startCapture()}
          label={"TOMAR FOTO"}
          imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
          width={620}
          height={50}
          //disabled={!canShoot}
          ariaLabel="Tomar foto"
          clickEffect={buttonClickEffect}
        />
      </div>
    </div>
  );
}
