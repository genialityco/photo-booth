"use client";

import React, { useRef, useState } from "react";
import FrameCamera from "./FrameCamera";
import captureWithFrame from "./captureWithFrame";
import captureRawSquare from "./captureRawSquare";
import ButtonPrimary from "@/app/items/ButtonPrimary";

export default function CaptureStep({
  // 👇 sin marco por defecto
  frameSrc = null,
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  onCaptured,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  onCaptured: (payload: { framed: string; raw: string }) => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // --- Solo se usan si activas marco ---
  // const frameImgRef = useRef<HTMLImageElement | null>(null);
  // const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  // const [frameReady, setFrameReady] = useState(false);

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

  // --- Precarga de marco (descomentar si se usa frameSrc) ---
  /*
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
      } catch {
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
        };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [frameSrc]);
  */

  // 👇 Sin marco: basta con videoReady
  // 👇 Con marco: sería videoReady && frameReady && !!frameSize
  const canShoot = videoReady;

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

    // --- Sin marco ---
    const square = Math.min(video.videoWidth || 1080, video.videoHeight || 1080);
    const targetW = square;
    const targetH = square;

    const framed = captureWithFrame({
      video,
      frame: null, // 👈 aquí no se dibuja ningún marco
      targetW,
      targetH,
      mirror,
    });

    // --- Con marco (ejemplo) ---
    /*
    const { w, h } = frameSize!;
    const frameImg = frameImgRef.current;
    const framed = captureWithFrame({
      video,
      frame: frameImg ?? null,
      targetW: w,
      targetH: h,
      mirror,
    });
    */

    const raw = captureRawSquare({ video, targetW, targetH, mirror });

    setFlash(true);
    setTimeout(() => setFlash(false), 120);

    onCaptured({ framed, raw });
  };

  return (
    <div className="h-[100svh] w-[100vw] flex flex-col items-center justify-center gap-6">
      <FrameCamera
        frameSrc={frameSrc ?? undefined} // 👈 si es null no renderiza <img>
        mirror={mirror}
        boxSize={boxSize}
        onReady={onReady}
      />

      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-7xl font-bold drop-shadow-lg">{countdown}</div>
        </div>
      )}
      {flash && (
        <div className="absolute inset-0 bg-white/80 animate-pulse pointer-events-none" />
      )}

      <ButtonPrimary
        onClick={startCapture}
        label={canShoot ? "TOMAR FOTO" : "Cargando cámara…"}
        imageSrc="/suRed/home/BOTON.png"
        width={220}
        height={68}
        disabled={!canShoot}
        ariaLabel="Tomar foto"
      />
    </div>
  );
}



