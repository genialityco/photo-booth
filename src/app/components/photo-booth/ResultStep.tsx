/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo, useEffect, useState } from "react";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import QrTag from "@/app/components/photo-booth/QrTag";
import { composeFramedCanvas, composeFramedImageDataUrl } from "@/app/components/photo-booth/composeFramedImage";

type Props = {
  taskId: string;
  aiUrl: string;
  videoUrl?: string;
  onAgain: () => void;
  footer?: React.ReactNode;
  buttonImage?: string;
};

export default function ResultStep({
  taskId,
  aiUrl,
  videoUrl,
  onAgain,
  buttonImage,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [qrSize, setQrSize] = useState(500);
  const enableFrame = event?.enableFrame ?? style?.enableFrame ?? true;
  const frameSrc = event?.frameImage ?? null;

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    
    if (videoUrl) {
      url.searchParams.set("src", videoUrl);
      url.searchParams.set("kind", "video");
      url.searchParams.set("filename", `video-ia-${taskId}.mp4`);
    } else {
      url.searchParams.set("src", aiUrl);
      url.searchParams.set("kind", "raw");
      url.searchParams.set("filename", `foto-ia-${taskId}.png`);
      
      // Agregar frameUrl solo si enableFrame está activado y hay frameImage
      if (enableFrame && frameSrc) {
        url.searchParams.set("frameUrl", frameSrc);
      }
    }
    
    return url.toString();
  }, [origin, aiUrl, videoUrl, taskId, enableFrame, frameSrc]);

  const SIZE_IMG = "clamp(300px, min(70vw, 60svh), 700px)";

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

        const dataUrl = await composeFramedImageDataUrl({ aiUrl, frameSrc, enableFrame });
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

  // Calcular tamaño del QR responsivo
  useEffect(() => {
    const updateQrSize = () => {
      const vw = window.innerWidth;
      // QR size: 100px en móvil, hasta 200px en desktop
      const size = Math.min(Math.max(180, vw * 0.12), 220);
      setQrSize(size);
    };

    updateQrSize();
    window.addEventListener("resize", updateQrSize);
    return () => window.removeEventListener("resize", updateQrSize);
  }, []);

  // === Descargar imagen o video ===
  const handleDownload = async () => {
    // Si hay video, descargarlo directamente
    if (videoUrl) {
      // Usar proxy para forzar "Content-Disposition: attachment" en iOS/Safari
      const downloadApiUrl = `/api/storage/download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(`video-ia-${taskId}.mp4`)}`;
      const a = document.createElement("a");
      a.href = downloadApiUrl;
      a.download = `video-ia-${taskId}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    try {
      const canvas = await composeFramedCanvas({ aiUrl, frameSrc, enableFrame });

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
      className="w-full h-full flex flex-col items-center justify-center px-3 sm:px-4  overflow-hidden"
    >
      {/* Contenido principal */}
      <main
        className="flex-1 w-full flex flex-col items-center  overflow-hidden"
       
      >
        {/* Imagen o Video IA con marco visible */}
        <div
          className="relative overflow-hidden bg-black/5 aspect-square"
          style={{ 
            width: SIZE_IMG,
            maxWidth: SIZE_IMG,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2)'
          }}
        >
          {videoUrl ? (
            <video
              src={videoUrl}
              className="absolute w-full h-full object-contain rounded-2xl shadow-2xl"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img
              src={framedImageUrl || aiUrl}
              alt="Imagen generada por IA"
              className="absolute w-full h-full object-contain select-none rounded-2xl shadow-2xl"
              draggable={false}
            />
          )}
        </div>

        {/* QR - BORDE REDONDEADO Y SOMBRA */}
        <div 
          className="absolute flex items-center justify-center z-10 flex-shrink-0 bottom-[10%] bg-white rounded-xl shadow-xl"
          style={{
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25), 0 5px 10px rgba(0, 0, 0, 0.15)',
            padding: `clamp(12px, ${qrSize * 0.12}px, 28px)`
          }}
        >
          <QrTag value={surveyAI} size={qrSize} />
        </div>

        {/* Botones */}
        <div className="flex flex-row items-center justify-center gap-1 sm:gap-2 overflow-x-auto whitespace-nowrap w-full flex-shrink-0 absolute bottom-0">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
             width="clamp(120px, 40vw, 310px)"
              height="clamp(40px, 8vh, 60px)"
            className="min-w-[130px]"
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR"
            imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
             width="clamp(120px, 40vw, 310px)"
              height="clamp(40px, 8vh, 60px)"
            className="min-w-[130px]"
          />
        </div>
      </main>
    </div>
  );
}