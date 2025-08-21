"use client";

import React, { useEffect, useRef, useState } from "react";
import FrameCamera from "./FrameCamera";
import captureWithFrame from "./captureWithFrame";
import captureRawSquare from "./captureRawSquare";
import ButtonPrimary from "@/app/items/ButtonPrimary";

export default function CaptureStep({
  frameSrc = "/images/marco.png",
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  onCaptured,
}: {
  frameSrc?: string;
  mirror?: boolean;
  boxSize?: string;
  onCaptured: (payload: { framed: string; raw: string }) => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // 👉 ahora usamos una imagen precargada con decode()
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(
    null
  );

  const [videoReady, setVideoReady] = useState(false);
  const [frameReady, setFrameReady] = useState(false);

  // Recibe el <video> desde FrameCamera y marca ready cuando tenga metadata
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

  // 🔒 Precarga y decodifica el PNG del marco de forma robusta
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const img = new Image();
        // Por si en prod sirves el PNG desde CDN distinto dominio:
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = frameSrc;

        // Espera a que esté en memoria listo para dibujar
        await img.decode();

        if (cancelled) return;
        frameImgRef.current = img;

        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w && h) {
          setFrameSize({ w, h });
          setFrameReady(true);
        } else {
          // fallback si decode no da dimensiones (raro pero posible)
          img.onload = () => {
            if (cancelled) return;
            const ww = img.naturalWidth || img.width;
            const hh = img.naturalHeight || img.height;
            setFrameSize({ w: ww, h: hh });
            setFrameReady(true);
          };
        }
      } catch {
        // si falla decode, intenta onload
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

  const canShoot = videoReady && frameReady && !!frameSize;

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
    const { w, h } = frameSize!;
    const video = videoElRef.current!;
    const frameImg = frameImgRef.current; // ✅ imagen decodificada

    const framed = captureWithFrame({
      video,
      frame: frameImg ?? null,
      targetW: w,
      targetH: h,
      mirror,
    });

    const raw = captureRawSquare({ video, targetW: w, targetH: h, mirror });

    // dentro de doCapture() tras obtener framed y raw:
    const framedLen = framed.length;
    const rawLen = raw.length;
    console.log("[CaptureStep] sizes base64:", {
      framedLen,
      rawLen,
      same: framed === raw,
    });

    setFlash(true);
    setTimeout(() => setFlash(false), 120);

    onCaptured({ framed, raw });
  };

  return (
    <div className="h-[100svh] w-[100vw] flex flex-col items-center justify-center gap-6">
      <FrameCamera
        frameSrc={frameSrc}
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
        imageSrc="/images/btn_principal.png"
        width={220}
        height={68}
        disabled={!canShoot}
        ariaLabel="Tomar foto"
      />
    </div>
  );
}
