/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import QrTag from "./QrTag";

type Props = {
  taskId: string;
  aiUrl: string;
  onAgain: () => void;
  footer?: React.ReactNode;
};

export default function ResultStep({ taskId, aiUrl, onAgain }: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    url.searchParams.set("src", aiUrl);
    url.searchParams.set("kind", "raw");
    url.searchParams.set("filename", `foto-ia-${taskId}.png`);
    return url.toString();
  }, [origin, aiUrl, taskId]);

  const SIZE_IMG = "clamp(260px, min(70vw, 60svh), 520px)";

  // === Helper para cargar imágenes con soporte CORS ===
  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // permite dibujar imágenes remotas
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  // === Descargar imagen compuesta con marco ===
  const handleDownload = async () => {
    try {
      const [baseImg, frameImg] = await Promise.all([
        loadImage(aiUrl),
        loadImage("/fenalco/MARCO_EMB_MARCA_1024x1024.png"),
      ]);

      const size = 1024;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = size;
      canvas.height = size;

      // Dibuja la imagen base "centrada y ajustada"
      const iw = baseImg.naturalWidth || baseImg.width;
      const ih = baseImg.naturalHeight || baseImg.height;
      const scale = Math.max(size / iw, size / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;

      ctx.drawImage(baseImg, dx, dy, dw, dh);
      ctx.drawImage(frameImg, 0, 0, size, size);

      // Exportar como blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("No se pudo generar la imagen final");

      // Descargar
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foto-ia-${taskId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando la descarga:", err);
      alert("No se pudo generar la imagen con el marco. Inténtalo nuevamente.");
    }
  };

  return (
    <div
      className="min-h-[100svh] w-full flex flex-col items-center justify-start px-6"
      style={{
        paddingTop: "max(-3rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Contenido principal */}
      <main className="flex-1 w-full flex flex-col items-center gap-5 mt-6">
        {/* Imagen IA con marco visible */}
        <div
          className="relative overflow-hidden rounded-2xl shadow-xl bg-black/5 aspect-square"
          style={{ width: SIZE_IMG }}
        >
          {/* Imagen IA */}
          <img
            src={aiUrl}
            alt="Imagen generada por IA"
            className="absolute inset-0 w-full h-full object-contain select-none"
            draggable={false}
          />
          {/* Marco superpuesto */}
          <img
            src="/fenalco/MARCO_EMB_MARCA_1024x1024.png"
            alt="Marco decorativo"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        </div>

        {/* QR (sin marco) */}
        <div className="rounded-xl flex items-center justify-center aspect-square z-10">
          <QrTag value={surveyAI} />
        </div>

        {/* Botones */}
        <div className="pt-4 flex flex-row items-center justify-center">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            width={190}
            height={50}
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR FOTO"
            width={190}
            height={50}
          />
        </div>
      </main>
    </div>
  );
}
