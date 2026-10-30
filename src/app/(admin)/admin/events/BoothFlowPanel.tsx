/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { FaArrowDown, FaArrowUp, FaChevronRight, FaExclamationTriangle } from "react-icons/fa";
import type { BoothFlow, EventProfile } from "@/app/services/photo-booth/eventService";
import type { PhotoBoothPrompt } from "@/app/services/photo-booth/brandService";
import MultiPromptCollage, { collageRatio } from "@/app/components/photo-booth/MultiPromptCollage";
import { getAspectDims } from "@/app/components/photo-booth/photoAspectRatio";
import {
  MULTI_PROMPT_BG_DEFAULT,
  MULTI_PROMPT_GAP_DEFAULT,
  MULTI_PROMPT_GAP_MAX,
  MULTI_PROMPT_MAX,
  MULTI_PROMPT_SHOWCASE_SECONDS_DEFAULT,
  layoutsForCount,
  resolveMultiPromptLayout,
  type MultiPromptLayoutId,
} from "@/app/components/photo-booth/multiPromptLayout";
import ImageUploadField from "./ImageUploadField";

type FlowStep = {
  title: string;
  detail: string;
  /** false = el paso existe pero está apagado con la config actual. */
  enabled: boolean;
  /** Sección del formulario donde se configura. */
  where?: string;
};

const REVEAL_LABELS: Record<NonNullable<EventProfile["revealEffect"]>, string> = {
  NONE: "Sin efecto",
  HAND_WIPE: "Borrar el velo con la mano",
  ROLLER: "Rodillo de pintura",
  ROLLER_COLOR: "Rodillo: blanco y negro a color",
  KINECT_ROLLER: "Rodillo Kinect (pantalla gigante)",
};

/** Colores de las celdas de la vista previa cuando el prompt no tiene imagen. */
const SLOT_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706"];

function promptLabel(prompt: PhotoBoothPrompt | undefined, id: string): string {
  return prompt?.brandName || prompt?.brand || id;
}

/** Los pasos que va a recorrer el asistente con la config actual del form. */
function computeSteps(data: Partial<EventProfile>, promptCount: number): FlowStep[] {
  const splash: FlowStep = {
    title: "Splash / pantalla de inicio",
    detail: data.showSplashScreen
      ? "Pantalla de bienvenida con el botón para empezar."
      : "Apagada: el booth arranca directo en el paso siguiente.",
    enabled: data.showSplashScreen === true,
    where: "Pantalla 1 · Splash Inicial",
  };
  const capture: FlowStep = {
    title: "Cámara",
    detail: `Se toma la foto y se confirma o se repite${
      data.captureViewStyle === "VIEWFINDER" ? " (visor con guía)" : ""
    }.`,
    enabled: true,
    where: "Flujo de Captura",
  };
  const customize: FlowStep = {
    title: "Dale tu toque",
    detail: data.imageCustomizationEnabled
      ? "Paleta, textura e intensidad, que se suman al prompt."
      : "Apagado.",
    enabled: data.imageCustomizationEnabled === true,
    where: "Flujo de Captura",
  };
  const loading: FlowStep = {
    title: "Pantalla de espera",
    detail: `Mientras la IA genera (${data.loadingEffect === "ROCKET" ? "cohete" : "anillo de progreso"}).`,
    enabled: true,
    where: "Pantalla 2 · Carga (Loading)",
  };

  if (data.boothFlow === "MULTI_PROMPT") {
    const n = Math.min(promptCount, MULTI_PROMPT_MAX);
    return [
      splash,
      capture,
      customize,
      { ...loading, detail: `Mientras la IA genera ${n || "las"} imagen${n === 1 ? "" : "es"} en paralelo.` },
      {
        title: "Animación de fotos",
        detail: `Pasan una a una las ${n || "—"} foto${n === 1 ? "" : "s"} (una por prompt, ${
          data.multiPromptShowcaseSeconds ?? MULTI_PROMPT_SHOWCASE_SECONDS_DEFAULT
        } s cada una).`,
        enabled: true,
        where: "Este panel",
      },
      {
        title: "Resultado + 1 QR",
        detail: "Las fotos por separado y un solo QR que descarga el collage con todas.",
        enabled: true,
        where: "Este panel",
      },
    ];
  }

  const multiBrand = promptCount > 1;
  const filterFirst = multiBrand && data.captureBeforeFilter !== true;
  const filterAfter = multiBrand && data.captureBeforeFilter === true;
  const reveal = data.revealEffect ?? "HAND_WIPE";
  return [
    splash,
    {
      title: "Selección de marca",
      detail: filterFirst
        ? `El asistente elige 1 de ${promptCount} prompts.`
        : filterAfter
          ? "Se elige después de la foto (ver más adelante)."
          : "Omitida: el evento tiene un solo prompt.",
      enabled: filterFirst,
      where: "Prompts (Marca IA)",
    },
    capture,
    {
      title: "Selección de marca",
      detail: `Después de confirmar la foto, el asistente elige 1 de ${promptCount} prompts.`,
      enabled: filterAfter,
      where: "Flujo de Captura",
    },
    customize,
    loading,
    {
      title: "Revelado",
      detail: reveal === "NONE" ? "Sin efecto: pasa directo al resultado." : REVEAL_LABELS[reveal],
      enabled: reveal !== "NONE",
      where: "Revelado de la Foto",
    },
    {
      title: "Resultado + QR",
      detail:
        data.generationType === "FACETS"
          ? "Carrusel de facetas; el QR descarga la faceta al frente."
          : "La foto generada y su QR de descarga.",
      enabled: true,
    },
  ].filter((s, i, all) => {
    // Las dos "Selección de marca" son el mismo paso en dos lugares posibles:
    // se muestra solo la activa (o la primera, apagada, si no hay ninguna).
    if (s.title !== "Selección de marca") return true;
    const active = all.findIndex((x) => x.title === "Selección de marca" && x.enabled);
    return active === -1 ? i === 1 : all[active] === s;
  });
}

/**
 * Panel "Flujo del Photobooth" del formulario de evento: elige el flujo
 * (clásico o multi-prompt), muestra de forma explicativa los pasos que va a
 * recorrer el asistente con la config actual, y en multi-prompt configura el
 * orden de los prompts y la distribución del collage que baja el QR.
 */
export default function BoothFlowPanel({
  formData,
  setField,
  promptIds,
  onPromptIdsChange,
  availablePrompts,
  onFrameImageChange,
}: {
  formData: Partial<EventProfile>;
  setField: <K extends keyof EventProfile>(field: K, value: EventProfile[K]) => void;
  /** Prompts del evento, en orden (= orden de las fotos en multi-prompt). */
  promptIds: string[];
  onPromptIdsChange: (ids: string[]) => void;
  availablePrompts: PhotoBoothPrompt[];
  onFrameImageChange: (value: string) => void;
}) {
  const flow: BoothFlow = formData.boothFlow ?? "CLASSIC";
  const multi = flow === "MULTI_PROMPT";
  const steps = computeSteps(formData, promptIds.length);

  const usedIds = promptIds.slice(0, MULTI_PROMPT_MAX);
  const count = usedIds.length;
  const { w, h } = getAspectDims(formData.photoAspectRatio);
  const tileRatio = w / h;
  const gapPct = formData.multiPromptGapPct ?? MULTI_PROMPT_GAP_DEFAULT;
  const bgColor = formData.multiPromptBgColor || MULTI_PROMPT_BG_DEFAULT;
  const layout = resolveMultiPromptLayout(Math.max(count, 1), formData.multiPromptLayout);
  const previewRatio = collageRatio(layout, tileRatio, gapPct);

  const promptById = (id: string) => availablePrompts.find((p) => p.id === id);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= promptIds.length) return;
    const next = [...promptIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onPromptIdsChange(next);
  };

  const renderSlot = (i: number, compact = false) => {
    const id = usedIds[i];
    const prompt = id ? promptById(id) : undefined;
    const image = prompt?.imageUrl;
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: SLOT_COLORS[i % SLOT_COLORS.length] }}>
        {image && !compact && <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />}
        <div className="relative text-center text-white drop-shadow px-1">
          <div className={compact ? "text-[10px] font-bold" : "text-2xl font-bold"}>{i + 1}</div>
          {!compact && id && <div className="text-xs font-semibold leading-tight line-clamp-2">{promptLabel(prompt, id)}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Elección de flujo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(
          [
            {
              id: "CLASSIC",
              title: "Clásico",
              body: "El asistente elige UNA marca/prompt, se genera una foto, se revela y se muestra con su QR.",
            },
            {
              id: "MULTI_PROMPT",
              title: "Multi-prompt (collage)",
              body: "Se genera una foto por cada prompt del evento (1 a 4), se muestran en una animación y al final un solo QR descarga el collage con todas.",
            },
          ] as { id: BoothFlow; title: string; body: string }[]
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setField("boothFlow", opt.id)}
            className={`text-left p-4 rounded-lg border-2 transition-colors ${
              flow === opt.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-4 w-4 rounded-full border-2 ${
                  flow === opt.id ? "border-blue-500 bg-blue-500 ring-2 ring-inset ring-white" : "border-gray-300"
                }`}
              />
              <span className="font-semibold text-gray-800">{opt.title}</span>
            </span>
            <span className="block text-xs text-gray-600 mt-1.5">{opt.body}</span>
          </button>
        ))}
      </div>

      {/* Diagrama del flujo actual */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Así lo va a recorrer el asistente</p>
        <ol className="flex flex-wrap items-stretch gap-y-3">
          {steps.map((s, i) => {
            const number = steps.slice(0, i + 1).filter((x) => x.enabled).length;
            return (
              <li key={`${s.title}-${i}`} className="flex items-center">
                <div
                  className={`w-40 sm:w-44 h-full rounded-lg border p-3 ${
                    s.enabled ? "border-blue-200 bg-white shadow-sm" : "border-dashed border-gray-300 bg-gray-50 opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        s.enabled ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {s.enabled ? number : "–"}
                    </span>
                    <span className={`text-sm font-semibold leading-tight ${s.enabled ? "text-gray-800" : "text-gray-500 line-through"}`}>
                      {s.title}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1.5">{s.detail}</p>
                  {s.where && <p className="text-[11px] text-gray-400 mt-1">Se configura en: {s.where}</p>}
                </div>
                {i < steps.length - 1 && <FaChevronRight className="mx-1.5 h-3 w-3 shrink-0 text-gray-300" aria-hidden />}
              </li>
            );
          })}
        </ol>
        {multi && formData.generationType && formData.generationType !== "IMAGE" && (
          <p className="text-xs text-amber-700 mt-2">
            En este flujo se ignora el &quot;Tipo de Generación&quot; ({formData.generationType}): siempre se genera una
            imagen por prompt.
          </p>
        )}
      </div>

      {multi && (
        <div className="space-y-5 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
          {/* Orden de los prompts */}
          <div>
            <p className="text-sm font-medium text-gray-700">Fotos que se generan (orden en el collage)</p>
            <p className="text-xs text-gray-500 mb-2">
              Una foto por prompt del evento, mínimo 1 y máximo {MULTI_PROMPT_MAX}. Los prompts se agregan o quitan en
              la sección &quot;Prompts (Marca IA)&quot;; acá se ordenan.
            </p>
            {promptIds.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-red-600">
                <FaExclamationTriangle className="h-3.5 w-3.5" /> El evento no tiene prompts: agrega al menos uno.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {promptIds.map((id, i) => {
                  const unused = i >= MULTI_PROMPT_MAX;
                  return (
                    <li
                      key={id}
                      className={`flex items-center gap-3 rounded border bg-white px-3 py-2 ${unused ? "opacity-50 border-dashed" : "border-gray-200"}`}
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
                        style={{ backgroundColor: unused ? "#9ca3af" : SLOT_COLORS[i % SLOT_COLORS.length] }}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm text-gray-700">
                        {promptLabel(promptById(id), id)}
                        {unused && <span className="ml-2 text-xs text-gray-500">(no se usa: máximo {MULTI_PROMPT_MAX})</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(i, i - 1)}
                        disabled={i === 0}
                        aria-label="Subir"
                        className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                      >
                        <FaArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, i + 1)}
                        disabled={i === promptIds.length - 1}
                        aria-label="Bajar"
                        className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                      >
                        <FaArrowDown className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Distribución */}
          {count > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Distribución del collage ({count} foto{count === 1 ? "" : "s"})
              </p>
              <div className="flex flex-wrap gap-2">
                {layoutsForCount(count).map((opt) => {
                  const selected = opt.id === layout.id;
                  const r = collageRatio(opt, tileRatio, 4);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setField("multiPromptLayout", opt.id as MultiPromptLayoutId)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 w-28 transition-colors ${
                        selected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="h-16 w-full flex items-center justify-center">
                        <div style={r >= 1 ? { width: "100%", maxWidth: 64 * r } : { width: 64 * r }}>
                          <MultiPromptCollage
                            layout={opt}
                            tileRatio={tileRatio}
                            gapPct={4}
                            bgColor="#e5e7eb"
                            cellClassName="rounded-[2px]"
                            renderCell={(i) => renderSlot(i, true)}
                          />
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Color de fondo del collage</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setField("multiPromptBgColor", e.target.value)}
                  className="h-9 w-12 rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={formData.multiPromptBgColor ?? ""}
                  placeholder={MULTI_PROMPT_BG_DEFAULT}
                  onChange={(e) => setField("multiPromptBgColor", e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Separación entre fotos: {gapPct}%
              </label>
              <input
                type="range"
                min={0}
                max={MULTI_PROMPT_GAP_MAX}
                step={0.5}
                value={gapPct}
                onChange={(e) => setField("multiPromptGapPct", Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-500">También es el margen exterior. 0 = fotos pegadas.</p>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Segundos por foto en la animación
              </label>
              <input
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={formData.multiPromptShowcaseSeconds ?? ""}
                placeholder={String(MULTI_PROMPT_SHOWCASE_SECONDS_DEFAULT)}
                onChange={(e) =>
                  setField("multiPromptShowcaseSeconds", e.target.value === "" ? undefined : Number(e.target.value))
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <ImageUploadField
            label="Marco del collage (PNG opcional, se dibuja encima de todo el collage)"
            value={formData.multiPromptFrameImage || ""}
            onChange={onFrameImageChange}
          />

          {/* Vista previa */}
          {count > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Vista previa de la imagen que descarga el QR</p>
              <div className="flex justify-center rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px] p-4">
                <div
                  className="shadow-lg"
                  style={previewRatio >= 1 ? { width: "100%", maxWidth: 520 } : { width: 380 * previewRatio }}
                >
                  <MultiPromptCollage
                    layout={layout}
                    tileRatio={tileRatio}
                    gapPct={gapPct}
                    bgColor={bgColor}
                    overlaySrc={formData.multiPromptFrameImage || undefined}
                    renderCell={(i) => renderSlot(i)}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Proporción final ≈ {previewRatio >= 1 ? `${previewRatio.toFixed(2)} : 1` : `1 : ${(1 / previewRatio).toFixed(2)}`}{" "}
                (ancho : alto) — úsala para diseñar el marco. Si alguna foto falla al generarse, el collage se arma con
                las que salieron.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
