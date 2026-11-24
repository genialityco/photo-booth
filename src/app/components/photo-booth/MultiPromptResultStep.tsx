/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import QrTag from "@/app/components/photo-booth/QrTag";
import MultiPromptCollage, {
  CENTER_OUT_CELL_CLASS,
  centerOutCellStyle,
  collageRatio,
} from "@/app/components/photo-booth/MultiPromptCollage";
import { useFitRatioBox } from "@/app/components/photo-booth/useFitAspectBox";
import { getAspectDims } from "@/app/components/photo-booth/photoAspectRatio";
import {
  MULTI_PROMPT_GAP_DEFAULT,
  MULTI_PROMPT_RESULT_EFFECT_DEFAULT,
  centerOutTotalMs,
  resolveMultiPromptLayout,
  resolveSplitGrid,
} from "@/app/components/photo-booth/multiPromptLayout";
import GridAssembleImage, { parseGridLayout } from "@/app/components/photo-booth/GridAssembleImage";
import GridPiecePicker from "@/app/components/photo-booth/GridPiecePicker";
import { buttonsLiftStyle, resultImageOffsetStyle } from "@/app/components/photo-booth/buttonsLift";

/** En pantalla las fotos van siempre separadas (aunque el collage descargable
 * las tenga pegadas): es la vista de "tus fotos", no el collage. */
const SCREEN_MIN_GAP_PCT = 3;

/** Nombre del archivo que baja el QR / el botón de descarga. `piece` = índice
 * de un panel suelto (splitUrls), o sin valor para la imagen completa. */
function downloadName(taskId: string, hasComposite: boolean, piece?: number) {
  if (piece !== undefined && piece >= 0) return `foto-${piece + 1}-${taskId}.jpg`;
  return hasComposite ? `collage-ia-${taskId}.jpg` : `foto-ia-${taskId}.png`;
}

/** URL de /survey (la que abre el QR en el celular) para el collage, o para
 * un solo panel (`piece`): ahí /survey lo deja ya elegido en su selector. */
export function buildMultiPromptSurveyUrl(opts: {
  taskId: string;
  downloadUrl: string;
  hasComposite: boolean;
  eventId?: string;
  piece?: number;
}): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = new URL(`${origin}/survey`);
  url.searchParams.set("src", opts.downloadUrl);
  url.searchParams.set("kind", "raw");
  url.searchParams.set("filename", downloadName(opts.taskId, opts.hasComposite, opts.piece));
  if (opts.piece !== undefined && opts.piece >= 0) url.searchParams.set("piece", String(opts.piece + 1));
  // El collage ya trae su propio marco (multiPromptFrameImage); el marco de
  // foto suelta del evento no le corresponde — ver `noFrame` en SurveyClient.
  url.searchParams.set("noFrame", "1");
  if (opts.eventId) url.searchParams.set("eventId", opts.eventId);
  // Liga la respuesta de la encuesta opcional de /survey a esta foto.
  if (opts.taskId) url.searchParams.set("taskId", opts.taskId);
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
  pieceUrls,
}: {
  taskId: string;
  urls: string[];
  compositeUrl?: string | null;
  /** Paneles sueltos de la foto dividida (`splitUrls` de la tarea, en orden
   * de lectura). Con ellos, tocar un panel lo agranda y el QR pasa a bajar
   * solo ese; tocarlo otra vez vuelve a la imagen completa. */
  pieceUrls?: string[] | null;
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
  // Entrada de las fotos (ver MultiPromptResultEffect). Con "desde el centro"
  // la barra del QR aparece cuando ya se armó la cuadrícula.
  const effect = event?.multiPromptResultEffect ?? MULTI_PROMPT_RESULT_EFFECT_DEFAULT;
  const centerOut = effect === "CENTER_OUT";
  const assembledMs = centerOut ? centerOutTotalMs(urls.length) : 0;
  // Una sola foto que ya trae varios paneles (ej. 4 facetas en 2x2): se
  // divide en pantalla y cada parte entra por separado. La barra del QR
  // aparece cuando GridAssembleImage avisa que quedó armada.
  const splitGrid = resolveSplitGrid(urls.length, effect, event?.multiPromptSplitGrid);
  const [splitAssembled, setSplitAssembled] = useState(false);
  const firstUrl = urls[0];
  useEffect(() => {
    setSplitAssembled(false);
  }, [firstUrl, splitGrid]);

  // Panel agrandado (-1 = la imagen completa). Solo con la foto ya armada y
  // con un panel suelto guardado por cada celda: sin eso el QR no tendría
  // qué bajar (tareas anteriores a que processImageTask guardara splitUrls).
  const grid = splitGrid ? parseGridLayout(splitGrid) : null;
  const pieces = grid && pieceUrls?.length === grid.cols * grid.rows ? pieceUrls : null;
  const canPick = !!pieces && splitAssembled;
  const [selected, setSelected] = useState(-1);
  useEffect(() => {
    setSelected(-1);
  }, [taskId, firstUrl]);
  const piece = canPick && selected >= 0 ? selected : -1;

  const downloadUrl = piece >= 0 ? pieces![piece] : compositeUrl || urls[0];
  const surveyUrl = useMemo(
    () =>
      buildMultiPromptSurveyUrl({
        taskId,
        downloadUrl,
        hasComposite: !!compositeUrl,
        eventId: event?.id,
        piece: piece >= 0 ? piece : undefined,
      }),
    [taskId, downloadUrl, compositeUrl, event?.id, piece]
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
    const name = downloadName(taskId, !!compositeUrl, piece >= 0 ? piece : undefined);
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
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 w-full flex items-center justify-center"
        // Solo en la tablet (con botones), igual que "Subir los botones".
        style={onAgain ? resultImageOffsetStyle(event?.resultImageOffsetPct) : undefined}
      >
        {splitGrid && urls[0] ? (
          <GridAssembleImage
            src={urls[0]}
            layout={splitGrid}
            className="absolute inset-0"
            flashes={event?.multiPromptAssembleFlashes !== false}
            onAssembled={() => setSplitAssembled(true)}
          />
        ) : boxDims && (
          <div style={{ width: boxDims.width }}>
            <MultiPromptCollage
              layout={layout}
              tileRatio={tileRatio}
              gapPct={gapPct}
              count={urls.length}
              cellClassName={`rounded-xl ring-1 ring-white/25 shadow-[0_10px_14px_-6px_rgba(0,0,0,0.45),0_25px_45px_-15px_rgba(0,0,0,0.6)] bg-black/20 ${
                centerOut ? CENTER_OUT_CELL_CLASS : ""
              }`}
              cellStyle={centerOut ? centerOutCellStyle : undefined}
              renderCell={(i) => (
                <img
                  src={urls[i]}
                  alt={`Foto ${i + 1}`}
                  className={`absolute inset-0 w-full h-full object-cover select-none ${centerOut ? "" : "multi-prompt-pop"}`}
                  style={centerOut ? undefined : { animationDelay: `${i * 120}ms` }}
                  draggable={false}
                />
              )}
            />
          </div>
        )}

        {/* Paneles tocables encima de la foto ya armada. Mismo rectángulo que
            la imagen de GridAssembleImage (object-contain, con container
            query), así cada zona cae justo sobre su panel. */}
        {canPick && grid && pieces && (
          <GridPiecePicker
            src={urls[0]}
            pieces={pieces}
            cols={grid.cols}
            rows={grid.rows}
            selected={piece}
            onSelect={setSelected}
            imageRatio={tileRatio}
            large={large}
          />
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
            {piece >= 0
              ? `Escanea para descargar la foto ${piece + 1} en tu celular`
              : "Escanea para descargar tus fotos en tu celular"}
          </span>
        </button>
      </div>

      {/* QR único + acciones */}
      <div
        className={`relative z-20 flex-shrink-0 w-full flex items-center justify-center gap-3 sm:gap-4 ${
          splitGrid ? (splitAssembled ? "multi-prompt-pop" : "invisible") : centerOut ? "multi-prompt-pop" : ""
        }`}
        style={{
          ...(centerOut && !splitGrid ? { animationDelay: `${Math.max(0, assembledMs - 300)}ms` } : {}),
          // Solo en la tablet (con botones); la pantalla espejo no los tiene.
          ...(onAgain ? buttonsLiftStyle(event?.buttonsLiftPct) : {}),
        }}
      >
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
            {piece >= 0 ? `Escanea y llévate la foto ${piece + 1}` : "Escanea y llévate tus fotos"}
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
