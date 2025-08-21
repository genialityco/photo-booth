/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState } from "react";
import ButtonPrimary from "../items/ButtonPrimary";

export type FrameBox = {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
};

type VideoElRef = React.RefObject<HTMLVideoElement | null>;

type Props = {
  videoRef: VideoElRef;
  frameSrc: string;
  frameBox: { xPct: number; yPct: number; wPct: number; hPct: number };
  onCapture: () => void;
};

export default function CameraView({
  videoRef,
  frameSrc,
  frameBox,
  onCapture,
}: Props) {
  const [frameAR, setFrameAR] = useState<number | null>(null);

  // Medir relación de aspecto real del PNG
  useEffect(() => {
    const img = new Image();
    img.src = frameSrc;
    const onLoad = () => setFrameAR(img.naturalWidth / img.naturalHeight);
    if (img.complete) onLoad();
    else img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [frameSrc]);


  const aspect = frameAR ?? 1;

  // Estado para el contador
  const [countdown, setCountdown] = useState<number | null>(null);

  // Manejar el conteo regresivo
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      onCapture();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onCapture]);

  // Al presionar el botón, iniciar el conteo
  const handleCaptureClick = () => {
    if (countdown === null) setCountdown(3);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="relative overflow-visible rounded-xl"
        style={{
          width: "min(92vw, calc(100svh - 220px), 1100px)",
          aspectRatio: String(aspect),
          ["--x" as any]: `${frameBox.xPct}%`,
          ["--y" as any]: `${frameBox.yPct}%`,
          ["--w" as any]: `${frameBox.wPct}%`,
          ["--h" as any]: `${frameBox.hPct}%`,
        }}
      >
        {/* VIDEO SOLO EN EL HUECO */}
        <div
          className="absolute overflow-hidden rounded-md bg-black"
          style={{
            left: "var(--x)",
            top: "var(--y)",
            width: "var(--w)",
            height: "var(--h)",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>

        {/* MARCO encima (no se deforma) */}
        <img
          src={frameSrc}
          alt="Marco"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none drop-shadow-[0_28px_36px_rgba(0,0,0,0.45)]"
          draggable={false}
        />

        {/* Loader que NO bloquea clics mientras se mide el AR del PNG */}
        {!frameAR && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="h-10 w-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
          </div>
        )}

        {/* Contador flotante */}
        {countdown !== null && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none z-20">
            <span className="text-white text-7xl font-bold drop-shadow-lg select-none">
              {countdown}
            </span>
          </div>
        )}

        {/* Botones flotantes */}
        <div className="absolute inset-x-0 bottom-[-90px] flex justify-center gap-3">
          <ButtonPrimary onClick={handleCaptureClick} label="TOMAR FOTO" disabled={countdown !== null} />
        </div>
      </div>
    </div>
  );
}
