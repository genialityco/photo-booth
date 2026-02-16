/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo, useEffect, useState } from "react";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import QrTag from "@/app/components/photo-booth/QrTag";

type Props = {
  taskId: string;
  aiUrl: string;
  onAgain: () => void;
  footer?: React.ReactNode;
  buttonImage?: string;
};

export default function ResultStep({
  taskId,
  aiUrl,
  onAgain,
  buttonImage,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const enableFrame = event?.enableFrame ?? style?.enableFrame ?? true;
  const frameSrc = event?.frameImage ?? style?.frameImage ?? null;

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    url.searchParams.set("src", aiUrl);
    url.searchParams.set("kind", "raw");
    url.searchParams.set("filename", `foto-ia-${taskId}.png`);
    return url.toString();
  }, [origin, aiUrl, taskId]);

  const SIZE_IMG = "clamp(280px, min(68vw, 58svh), 450px)";

  // === Helper para cargar imágenes con soporte CORS ===
  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // permite dibujar imágenes remotas
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  // === Componer imagen con marco (para preview en pantalla) ===
  const [framedImageUrl, setFramedImageUrl] = useState<string>("");

  useEffect(() => {
    if (!aiUrl) return;

    const composeFrame = async () => {
      try {
        // Si enableFrame está desactivado o no hay frameSrc, mostrar imagen sin marco
        if (!enableFrame || !frameSrc) {
          setFramedImageUrl(aiUrl);
          return;
        }

        const [baseImg, frameImg] = await Promise.all([
          loadImage(aiUrl),
          loadImage(frameSrc),
        ]);

        const size = 1024;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = size;
        canvas.height = size;
        ctx.clearRect(0, 0, size, size);

        // Dibuja imagen base (cover)
        const iw = baseImg.naturalWidth || baseImg.width;
        const ih = baseImg.naturalHeight || baseImg.height;
        const scale = Math.max(size / iw, size / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (size - dw) / 2;
        const dy = (size - dh) / 2;
        ctx.drawImage(baseImg, dx, dy, dw, dh);

        // Dibuja marco encima
        ctx.drawImage(frameImg, 0, 0, size, size);

        // Exportar como dataURL
        const dataUrl = canvas.toDataURL("image/png");
        setFramedImageUrl(dataUrl);
      } catch (err) {
        console.error("Error composing frame:", err);
        setFramedImageUrl(aiUrl); // Fallback a imagen sin marco
      }
    };

    composeFrame();
  }, [aiUrl, frameSrc, enableFrame]);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("photoBoothStyle");
      if (cached) {
        const parsed = JSON.parse(cached);
        setStyle(parsed);
        console.log("[ResultStep] loaded cached style:", parsed?.id || parsed);
      }

      const cachedEvent = sessionStorage.getItem("currentEvent");
      if (cachedEvent) {
        const parsedEvent = JSON.parse(cachedEvent);
        setEvent(parsedEvent);
        console.log(
          "[ResultStep] loaded cached event:",
          parsedEvent?.slug || parsedEvent?.id,
        );
      }
    } catch (e) {
      console.warn("[ResultStep] error reading sessionStorage", e);
    }
  }, []);

  // === Descargar imagen compuesta con marco ===
  const handleDownload = async () => {
    try {
      // Si enableFrame está desactivado o no hay frameSrc, descargar solo la imagen base
      if (!enableFrame || !frameSrc) {
        const baseImg = await loadImage(aiUrl);
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

        // Exportar como blob
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
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
        return;
      }

      // Descargar con marco
      const [baseImg, frameImg] = await Promise.all([
        loadImage(aiUrl),
        loadImage(frameSrc),
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
      
      // Dibuja el marco encima
      ctx.drawImage(frameImg, 0, 0, size, size);

      // Exportar como blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
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
      className="w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 py-2 sm:py-3 overflow-hidden"
    >
      {/* Contenido principal */}
      <main
        className="flex-1 w-full flex flex-col items-center gap-1 sm:gap-2 md:gap-2 overflow-hidden"
        style={{
          marginTop: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        {/* Imagen IA con marco visible */}
        <div
          className="relative overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg md:shadow-xl bg-black/5 aspect-square w-full max-w-xs sm:max-w-sm md:max-w-md"
          style={{ width: SIZE_IMG }}
        >
          {/* Imagen IA con marco */}
          <img
            src={framedImageUrl || aiUrl}
            alt="Imagen generada por IA"
            className="absolute inset-0 w-full h-full object-contain select-none"
            draggable={false}
          />
          {/* Marco superpuesto */}
        </div>
        <img
            src={event?.frameImage || "/congresoEdu/MARCO_CONGRESO-DE-EDUACION_FINAL.png"} 
            alt="Marco decorativo"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />

        {/* QR (sin marco) */}
        <div className="flex items-center justify-center z-10 flex-shrink-0">
          <div className="w-24 sm:w-28 md:w-32 lg:w-40">
            <QrTag value={surveyAI} size={180} />
          </div>
        </div>

        {/* Botones */}
        <div className="flex flex-row items-center justify-center gap-1 sm:gap-2 overflow-x-auto whitespace-nowrap w-full flex-shrink-0">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
            width={130}
            className="min-w-[130px]"
            height={48}
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR"
            imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
            width={130}
            className="min-w-[130px]"
            height={48}
          />
        </div>
      </main>
    </div>
  );
}
