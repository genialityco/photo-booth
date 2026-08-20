/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo, useEffect, useState } from "react";
import { FaQrcode } from "react-icons/fa";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import QrTag from "@/app/components/photo-booth/QrTag";
import { composeFramedCanvas, composeFramedImageDataUrl } from "@/app/components/photo-booth/composeFramedImage";
import { getAspectClassName, getPixelDims, getRevealBoxWidthCss } from "@/app/components/photo-booth/photoAspectRatio";

type Props = {
  taskId: string;
  aiUrl: string;
  videoUrl?: string;
  onAgain: () => void;
  footer?: React.ReactNode;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
};

export default function ResultStep({
  taskId,
  aiUrl,
  videoUrl,
  onAgain,
  buttonImage,
  buttonClickEffect,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [qrSize, setQrSize] = useState(500);
  const [showQr, setShowQr] = useState(false);
  const enableFrame = event?.enableFrame ?? style?.enableFrame ?? true;
  const frameSrc = event?.frameImage ?? null;
  const aspectRatio = event?.photoAspectRatio;
  const pixelDims = useMemo(() => getPixelDims(aspectRatio), [aspectRatio]);

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

  const SIZE_IMG = getRevealBoxWidthCss(aspectRatio);

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

        const dataUrl = await composeFramedImageDataUrl({
          aiUrl,
          frameSrc,
          enableFrame,
          width: pixelDims.width,
          height: pixelDims.height,
        });
        setFramedImageUrl(dataUrl);
      } catch (err) {
        console.error("Error composing frame:", err);
        setFramedImageUrl(aiUrl); // Fallback a imagen sin marco
      }
    };

    composeFrame();
  }, [aiUrl, frameSrc, enableFrame, pixelDims.width, pixelDims.height]);

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

  // Calcular tamaño del QR responsivo. Ahora el QR ocupa la misma caja
  // grande que la foto (hasta 700px, ver SIZE_IMG), así que le damos más
  // espacio del que tenía cuando era un sello chico superpuesto — pero
  // limitado también por el alto de pantalla, para no desbordar la caja en
  // pantallas bajas y anchas.
  useEffect(() => {
    const updateQrSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const size = Math.min(Math.max(280, vw * 0.38), vh * 0.36, 480);
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
      const canvas = await composeFramedCanvas({
        aiUrl,
        frameSrc,
        enableFrame,
        width: pixelDims.width,
        height: pixelDims.height,
      });

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

  // === Imprimir (ej. Canon Selphy CP1500 configurada como impresora
  // predeterminada del kiosco): abre una ventana con la foto compuesta y
  // dispara el diálogo de impresión nativo del navegador — mismo patrón que
  // (public)/print/page.tsx, con estilos ajustados para llenar la página. No
  // aplica a eventos con video. ===
  const handlePrint = async () => {
    if (videoUrl) return;
    try {
      const canvas = await composeFramedCanvas({
        aiUrl,
        frameSrc,
        enableFrame,
        width: pixelDims.width,
        height: pixelDims.height,
      });
      const dataUrl = canvas.toDataURL("image/png");

      const printWin = window.open("", "_blank");
      if (!printWin) {
        alert("El navegador bloqueó la ventana de impresión.");
        return;
      }
      printWin.document.write(`
        <html>
          <head>
            <title>Imprimir</title>
            <style>
              @page { margin: 0; }
              html, body { margin: 0; padding: 0; background: #fff; height: 100%; }
              img { display: block; width: 100vw; height: 100vh; object-fit: contain; margin: auto; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" />
            <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 300); };</script>
          </body>
        </html>
      `);
      printWin.document.close();
    } catch (err) {
      console.error("Error preparando la impresión:", err);
      alert("No se pudo preparar la foto para imprimir. Inténtalo nuevamente.");
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden"
    >
      {/* Contenido principal — scroll de emergencia si no alcanza el alto
          (foto + botón QR + QR abierto + botones, todo junto, en una
          pantalla baja). */}
      <main className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-3 sm:gap-4 overflow-y-auto py-2 sm:py-4">
        {/* Imagen/Video IA — o el QR, cuando está activo, en el mismo
            espacio (mismo tamaño de caja, sin salto de layout). Mat + sombra
            en capas, mismo tratamiento que el resto del wizard. */}
        <div
          className="relative flex-shrink-0 p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 rounded-2xl shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)]"
          style={{ width: SIZE_IMG, maxWidth: SIZE_IMG }}
        >
          <div
            className={`relative w-full h-full overflow-hidden rounded-xl ${getAspectClassName(aspectRatio)} flex items-center justify-center transition-colors ${
              showQr ? "bg-white" : "bg-black/5"
            }`}
          >
            {showQr ? (
              <QrTag value={surveyAI} size={qrSize} label="Escanea para descargar tu foto en tu celular" />
            ) : videoUrl ? (
              <video
                src={videoUrl}
                className="absolute inset-0 w-full h-full object-contain"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img
                src={framedImageUrl || aiUrl}
                alt="Imagen generada por IA"
                className="absolute inset-0 w-full h-full object-contain select-none"
                draggable={false}
              />
            )}
          </div>
        </div>

        {/* Botón para alternar entre la foto y el QR en la misma caja. */}
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="flex-shrink-0 inline-flex items-center gap-2 bg-white/90 hover:bg-white active:scale-95 transition-all rounded-full px-5 py-2.5 shadow-lg font-semibold text-black"
          style={{ fontSize: "clamp(0.85rem, 2vmin, 1.05rem)" }}
        >
          <FaQrcode className="w-4 h-4" aria-hidden />
          {showQr ? "Ver foto" : "Mostrar QR"}
        </button>

        {/* Botones: nueva foto / descargar */}
        <div className="flex-shrink-0 w-full flex flex-row items-center justify-center gap-2 sm:gap-3 overflow-x-auto whitespace-nowrap">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            imageSrc={buttonImage}
            colorFrom={event?.splashButtonColorFrom}
            colorTo={event?.splashButtonColorTo}
            width="clamp(120px, 40vw, 310px)"
            height="clamp(40px, 8vh, 60px)"
            className="min-w-[130px]"
            clickEffect={buttonClickEffect}
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR"
            imageSrc={buttonImage}
            colorFrom={event?.splashButtonColorFrom}
            colorTo={event?.splashButtonColorTo}
            width="clamp(120px, 40vw, 310px)"
            height="clamp(40px, 8vh, 60px)"
            className="min-w-[130px]"
            clickEffect={buttonClickEffect}
          />
          {!videoUrl && (
            <ButtonPrimary
              onClick={handlePrint}
              label="IMPRIMIR"
              imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
              width="clamp(120px, 40vw, 310px)"
              height="clamp(40px, 8vh, 60px)"
              className="min-w-[130px]"
              clickEffect={buttonClickEffect}
            />
          )}
        </div>
      </main>
    </div>
  );
}