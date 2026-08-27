/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo, useEffect, useState } from "react";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import QrTag from "@/app/components/photo-booth/QrTag";
import { composeFramedCanvas, composeFramedImageDataUrl } from "@/app/components/photo-booth/composeFramedImage";
import { getPixelDims } from "@/app/components/photo-booth/photoAspectRatio";
import { useFitAspectBox } from "@/app/components/photo-booth/useFitAspectBox";

type Props = {
  taskId: string;
  aiUrl: string;
  videoUrl?: string;
  onAgain: () => void;
  footer?: React.ReactNode;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  /** Controlado por el padre (PhotoBoothWizard) en vez de estado local, para
   * poder transmitirlo a la pantalla espejo (BoothMirror) — ver
   * useBoothLiveSession. */
  showQr: boolean;
  onShowQrChange: (value: boolean) => void;
};

export default function ResultStep({
  taskId,
  aiUrl,
  videoUrl,
  onAgain,
  buttonImage,
  buttonClickEffect,
  showQr,
  onShowQrChange,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [qrSize, setQrSize] = useState(500);
  const enableFrame = event?.enableFrame ?? style?.enableFrame ?? true;
  const frameSrc = event?.frameImage ?? null;
  // Logo de auspiciante + texto de contacto "quemados" en la foto resultante
  // (composeFramedImage.ts) — a diferencia de frameSrc, no dependen de
  // enableFrame: son branding del evento, independiente del marco decorativo.
  const brandingLogoSrc = event?.brandingLogoUrl ?? null;
  const brandingFooterText = event?.brandingFooterText ?? null;
  const aspectRatio = event?.photoAspectRatio;
  const pixelDims = useMemo(() => getPixelDims(aspectRatio), [aspectRatio]);
  // Mide el contenedor real y encoge la foto para que todo (foto + botones)
  // quepa sin scroll, en vez del "scroll de emergencia" que había antes —
  // mismo mecanismo que PreviewStep, importante ahora que la relación de
  // aspecto es configurable por evento (3:4 ocupa más alto que el cuadrado
  // original).
  const { containerRef, boxDims } = useFitAspectBox(aspectRatio);

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

  // === Componer imagen con marco (para preview en pantalla) ===
  const [framedImageUrl, setFramedImageUrl] = useState<string>("");

  useEffect(() => {
    if (!aiUrl) return;

    const composeFrame = async () => {
      try {
        // Si no hay marco NI branding, mostrar la imagen tal cual (evita el
        // round-trip a canvas cuando no hace falta componer nada).
        if ((!enableFrame || !frameSrc) && !brandingLogoSrc && !brandingFooterText) {
          setFramedImageUrl(aiUrl);
          return;
        }

        const dataUrl = await composeFramedImageDataUrl({
          aiUrl,
          frameSrc,
          enableFrame,
          brandingLogoSrc,
          brandingFooterText,
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
  }, [aiUrl, frameSrc, enableFrame, brandingLogoSrc, brandingFooterText, pixelDims.width, pixelDims.height]);

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

  // Calcular tamaño del QR expandido (ocupa toda la caja de la foto al
  // tocarlo) — acotado también por el alto de pantalla, para no desbordar en
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
        brandingLogoSrc,
        brandingFooterText,
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

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden"
    >
      {/* Sin scroll: la foto encoge (useFitAspectBox) para que foto + botones
          quepan siempre en el alto disponible, incluso con relaciones de
          aspecto más altas que el cuadrado original (3:4). */}
      <main className="flex-1 min-h-0 w-full flex flex-col items-center gap-2 sm:gap-3 py-2 sm:py-4">
        {/* Imagen/Video IA, con el QR como sello en la esquina — tocarlo lo
            agranda a toda la caja (mismo lugar, sin salto de layout). Mat +
            sombra en capas, mismo tratamiento que el resto del wizard. */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 w-full flex items-center justify-center"
        >
          <div
            className="relative p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 rounded-2xl shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)]"
            style={
              boxDims
                ? { width: boxDims.width, height: boxDims.height }
                : { maxWidth: "100%", maxHeight: "100%" }
            }
          >
            <div className="relative w-full h-full overflow-hidden rounded-xl bg-black/5">
              {videoUrl ? (
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

              <button
                type="button"
                onClick={() => onShowQrChange(!showQr)}
                aria-label={showQr ? "Volver a la foto" : "Mostrar código QR para descargar la foto"}
                className={`absolute rounded-xl transition-all duration-300 ease-out ${
                  showQr
                    ? "inset-0 bg-white flex flex-col items-center justify-center gap-2 p-4"
                    : "bottom-2 right-2 sm:bottom-3 sm:right-3 bg-white p-1.5 sm:p-2 shadow-lg ring-1 ring-black/10 active:scale-95"
                }`}
              >
                <QrTag
                  value={surveyAI}
                  size={showQr ? qrSize : Math.max(48, Math.min(88, (boxDims?.width ?? 240) * 0.22))}
                  label={showQr ? "Escanea para descargar tu foto en tu celular" : undefined}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Botones: nueva foto / descargar */}
        <div className="flex-shrink-0 w-full flex flex-row items-center justify-center gap-2 sm:gap-3 overflow-x-auto whitespace-nowrap">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            imageSrc={buttonImage}
            colorFrom={event?.splashButtonColorFrom}
            colorTo={event?.splashButtonColorTo}
            width="clamp(96px, 30vw, 310px)"
            height="clamp(40px, 8vh, 60px)"
            className="flex-1 basis-0 min-w-0 max-w-[310px]"
            clickEffect={buttonClickEffect}
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR"
            imageSrc={buttonImage}
            colorFrom={event?.splashButtonColorFrom}
            colorTo={event?.splashButtonColorTo}
            width="clamp(96px, 30vw, 310px)"
            height="clamp(40px, 8vh, 60px)"
            className="flex-1 basis-0 min-w-0 max-w-[310px]"
            clickEffect={buttonClickEffect}
          />
        </div>
      </main>
    </div>
  );
}