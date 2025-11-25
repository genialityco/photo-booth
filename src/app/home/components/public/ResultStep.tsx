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

  // Detectar si la URL es de video o imagen
  const isVideo = useMemo(() => {
    const lower = aiUrl.toLowerCase();
    if (
      lower.includes(".mp4") ||
      lower.includes(".webm") ||
      lower.includes(".mov")
    ) {
      return true;
    }
    if (
      lower.includes(".png") ||
      lower.includes(".jpg") ||
      lower.includes(".jpeg") ||
      lower.includes(".webp")
    ) {
      return false;
    }
    // Si no se puede inferir, y tu backend ahora genera video, asumimos video
    return true;
  }, [aiUrl]);

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    url.searchParams.set("src", aiUrl);
    url.searchParams.set("kind", isVideo ? "video" : "raw");
    url.searchParams.set(
      "filename",
      `foto-ia-${taskId}.${isVideo ? "mp4" : "png"}`
    );
    return url.toString();
  }, [origin, aiUrl, taskId, isVideo]);

  const SIZE_IMG = "clamp(260px, min(70vw, 60svh), 520px)";

  // === Helper para cargar imágenes con soporte CORS (solo se usa en modo imagen) ===
  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // permite dibujar imágenes remotas
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  // === Descargar: video directo o imagen compuesta con marco ===
  const handleDownload = async () => {
    // MODO VIDEO: descarga el archivo tal cual
    if (isVideo) {
      try {
        const a = document.createElement("a");
        a.href = aiUrl;
        a.download = `video-ia-${taskId}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.error("Error descargando el video:", err);
        alert("No se pudo descargar el video. Inténtalo nuevamente.");
      }
      return;
    }

    // MODO IMAGEN: compone en canvas con el marco
    try {
      const [baseImg, frameImg] = await Promise.all([
        loadImage(aiUrl),
        loadImage("/suRed/MARCO_UM_RECUERDO.png"),
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

      <main className="flex-1 w-full flex flex-col items-center gap-5 mt-10 px-4">
        {/* Media IA con marco visible - MÁS GRANDE (formato póster) */}
        <div
          className="
      relative overflow-hidden rounded-2xl shadow-xl bg-black/5
      aspect-[9/16] w-[clamp(360px,62vmin,1200px)]
      max-h-[calc(100svh-180px)]
    "
        >
          {/* Imagen o video IA */}
          {isVideo ? (
            <video
              src={aiUrl}
              autoPlay
              loop
              controls
              playsInline
              className="absolute inset-0 w-full h-full object-cover select-none z-10"
            />
          ) : (
            <img
              src={aiUrl}
              alt="Imagen generada por IA"
              className="absolute inset-0 w-full h-full object-cover select-none z-10"
              draggable={false}
            />
          )}

          {/* Marco superpuesto (debajo del QR) */}
          {/* <img
            src="/suRed/MARCO_UM_RECUERDO.png"
            alt="Marco decorativo"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-20"
            draggable={false}
          /> */}

          {/* QR superpuesto (encima de TODO) */}
        </div>

        {/* (Opcional) Si ya sobrepones el QR, puedes remover este bloque inferior
  <div className="rounded-xl flex items-center justify-center aspect-square z-10">
    <QrTag value={surveyAI} />
  </div>
  */}
      </main>
      <div className="absolute left-1/2 -translate-x-1/2 z-30 bottom-[min(18%)]">
        <div className="rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/10">
          <div className="w-[clamp(160px,22vmin,280px)]">
            <QrTag value={surveyAI} />
          </div>
        </div>
      </div>
    </div>
  );
}
