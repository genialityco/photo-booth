/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import QrTag from "@/app/components/photo-booth/QrTag";
import MultiPromptCollage, { collageRatio } from "@/app/components/photo-booth/MultiPromptCollage";
import { useFitRatioBox } from "@/app/components/photo-booth/useFitAspectBox";
import { getAspectDims } from "@/app/components/photo-booth/photoAspectRatio";
import {
  MULTI_PROMPT_GAP_DEFAULT,
  resolveMultiPromptLayout,
} from "@/app/components/photo-booth/multiPromptLayout";

/** En pantalla las fotos van siempre separadas (aunque el collage descargable
 * las tenga pegadas): es la vista de "tus fotos", no el collage. */
const SCREEN_MIN_GAP_PCT = 3;

/** Nombre del archivo que baja el QR / el botón de descarga. */
function downloadName(taskId: string, hasComposite: boolean) {
  return hasComposite ? `collage-ia-${taskId}.jpg` : `foto-ia-${taskId}.png`;
}

/** URL de /survey (la que abre el QR en el celular) para el collage. */
export function buildMultiPromptSurveyUrl(opts: {
  taskId: string;
  downloadUrl: string;
  hasComposite: boolean;
  eventId?: string;
}): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = new URL(`${origin}/survey`);
  url.searchParams.set("src", opts.downloadUrl);
  url.searchParams.set("kind", "raw");
  url.searchParams.set("filename", downloadName(opts.taskId, opts.hasComposite));
  // El collage ya trae su propio marco (multiPromptFrameImage); el marco de
  // foto suelta del evento no le corresponde — ver `noFrame` en SurveyClient.
  url.searchParams.set("noFrame", "1");
  if (opts.eventId) url.searchParams.set("eventId", opts.eventId);
  return url.toString();
}

/**
 * Resultado del flujo multi-prompt: las fotos por separado (en la
 * distribución y el orden del collage configurados en el admin) y UN solo QR,
 * que baja el collage armado por processImageTask (`compositeUrl`; si el
 * collage falló, la primera foto).
 *
 * Lo usan la tablet (PhotoBoothWizard, con botones) y la pantalla espejo
 * (BoothMirror, sin `onAgain`: solo mira).
 */
export default function MultiPromptResultStep({
  taskId,
  urls,
  compositeUrl,
  event,
  showQr,
  onShowQrChange,
  onAgain,
  buttonImage,
  buttonClickEffect,
  large = false,
}: {
  taskId: string;
  urls: string[];
  compositeUrl?: string | null;
  event?: EventProfile | null;
  showQr: boolean;
  onShowQrChange: (value: boolean) => void;
  /** Sin esto no se muestran los botones (pantalla espejo). */
  onAgain?: () => void;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  /** Pantalla espejo: QR y textos más grandes. */
  large?: boolean;
}) {
  const layout = resolveMultiPromptLayout(urls.length, event?.multiPromptLayout);
  const { w, h } = getAspectDims(event?.photoAspectRatio);
  const tileRatio = w / h;
  const gapPct = Math.max(event?.multiPromptGapPct ?? MULTI_PROMPT_GAP_DEFAULT, SCREEN_MIN_GAP_PCT);
  const { containerRef, boxDims } = useFitRatioBox(collageRatio(layout, tileRatio, gapPct));

  const downloadUrl = compositeUrl || urls[0];
  const surveyUrl = useMemo(
    () =>
      buildMultiPromptSurveyUrl({
        taskId,
        downloadUrl,
        hasComposite: !!compositeUrl,
        eventId: event?.id,
      }),
    [taskId, downloadUrl, compositeUrl, event?.id]
  );

  const [qrSize, setQrSize] = useState(320);
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setQrSize(Math.min(Math.max(240, vw * 0.38), vh * 0.4, vw * 0.78, 480));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handleDownload = () => {
    // Proxy propio (Content-Disposition: attachment), igual que el video en
    // ResultStep: enlazar directo a Storage abre la imagen en vez de bajarla.
    const name = downloadName(taskId, !!compositeUrl);
    const a = document.createElement("a");
    a.href = `/api/storage/download?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(name)}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const sealSize = large ? 132 : 84;

  return (
    <div className="w-full h-full flex flex-col items-center px-3 sm:px-4 py-2 sm:py-4 gap-2 sm:gap-3 overflow-hidden">
      {/* Fotos: la caja más grande con la forma de la distribución que cabe. */}
      <div ref={containerRef} className="relative flex-1 min-h-0 w-full flex items-center justify-center">
        {boxDims && (
          <div style={{ width: boxDims.width }}>
            <MultiPromptCollage
              layout={layout}
              tileRatio={tileRatio}
              gapPct={gapPct}
              count={urls.length}
              cellClassName="rounded-xl ring-1 ring-white/25 shadow-[0_10px_14px_-6px_rgba(0,0,0,0.45),0_25px_45px_-15px_rgba(0,0,0,0.6)] bg-black/20"
              renderCell={(i) => (
                <img
                  src={urls[i]}
                  alt={`Foto ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover select-none multi-prompt-pop"
                  style={{ animationDelay: `${i * 120}ms` }}
                  draggable={false}
                />
              )}
            />
          </div>
        )}

        {/* QR ampliado encima de las fotos (tocar para volver). */}
        <button
          type="button"
          onClick={() => onShowQrChange(false)}
          aria-hidden={!showQr}
          tabIndex={showQr ? 0 : -1}
          aria-label="Volver a las fotos"
          className={`absolute z-20 left-1/2 top-1/2 flex flex-col items-center gap-3 rounded-3xl bg-white px-6 py-6 shadow-2xl ring-1 ring-black/10 transition-all duration-300 ease-out ${
            showQr
              ? "opacity-100 scale-100 -translate-x-1/2 -translate-y-1/2"
              : "opacity-0 scale-90 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          }`}
        >
          <QrTag value={surveyUrl} size={qrSize} />
          <span
            className="max-w-[90%] text-center font-semibold leading-tight text-black/80"
            style={{ fontSize: large ? "clamp(1rem, 2.2vw, 1.6rem)" : undefined }}
          >
            Escanea para descargar tus fotos en tu celular
          </span>
        </button>
      </div>

      {/* QR único + acciones */}
      <div className="flex-shrink-0 w-full flex items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onShowQrChange(!showQr)}
          aria-label="Mostrar código QR para descargar las fotos"
          className="flex items-center gap-3 rounded-2xl bg-white p-2 pr-4 shadow-lg ring-1 ring-black/10 active:scale-95 transition"
        >
          <QrTag value={surveyUrl} size={sealSize} />
          <span
            className={`text-left font-semibold leading-tight text-black/80 ${large ? "text-xl max-w-[14rem]" : "text-xs sm:text-sm max-w-[8rem]"}`}
          >
            Escanea y llévate tus fotos
          </span>
        </button>

        {onAgain && (
          <div className="flex flex-col gap-2 min-w-0">
            <ButtonPrimary
              onClick={onAgain}
              label="NUEVA FOTO"
              imageSrc={buttonImage}
              colorFrom={event?.splashButtonColorFrom}
              colorTo={event?.splashButtonColorTo}
              width="clamp(96px, 30vw, 260px)"
              height="clamp(36px, 6vh, 52px)"
              clickEffect={buttonClickEffect}
            />
            <ButtonPrimary
              onClick={handleDownload}
              label="DESCARGAR"
              imageSrc={buttonImage}
              colorFrom={event?.splashButtonColorFrom}
              colorTo={event?.splashButtonColorTo}
              width="clamp(96px, 30vw, 260px)"
              height="clamp(36px, 6vh, 52px)"
              clickEffect={buttonClickEffect}
            />
          </div>
        )}
      </div>
    </div>
  );
}
