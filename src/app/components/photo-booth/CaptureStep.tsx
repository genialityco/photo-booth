"use client";

import React, { useRef, useState, useEffect } from "react";
import FrameCamera from "./FrameCamera";
import captureWithFrame from "./captureWithFrame";
import captureRawSquare from "./captureRawSquare";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";

export default function CaptureStep({
  // 👇 sin marco por defecto
  frameSrc = null,
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  onCaptured,
  buttonImage,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  buttonImage?: string;
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
      else v.onloadedmetadata = mark;
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
    ? videoReady && frameReady && !!frameSize
    : videoReady;

  const startCapture = () => {
    if (!canShoot) return;
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

  const doCapture = async () => {
    const video = videoElRef.current;
    if (!video) return;

    let framed: string;
    let raw: string;

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
    raw = captureRawSquare({ video, targetW: square, targetH: square, mirror });

    setFlash(true);
    setTimeout(() => setFlash(false), 120);

    onCaptured({ framed, raw });
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 sm:gap-2 overflow-hidden px-2 sm:px-3">
      <div className="flex-1 flex items-center justify-center w-full overflow-hidden">
        <FrameCamera
          frameSrc={frameSrc ?? undefined} // 👈 si es null no renderiza <img>
          mirror={mirror}
          boxSize={boxSize}
          onReady={onReady}
        />
      </div>

      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-7xl font-bold drop-shadow-lg">{countdown}</div>
        </div>
      )}
      {flash && (
        <div className="absolute inset-0 bg-white/80 animate-pulse pointer-events-none" />
      )}

      <div className="flex-shrink-0">
        <ButtonPrimary
          onClick={startCapture}
          label={canShoot ? "TOMAR FOTO" : "Cargando cámara…"}
          imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
          width={180}
          height={52}
          disabled={!canShoot}
          ariaLabel="Tomar foto"
        />
      </div>
    </div>
  );
}
