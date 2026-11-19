"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FaArrowDown, FaArrowUp, FaDownload, FaPlus, FaSync, FaTrash } from "react-icons/fa";
import {
  SURVEY_DEFAULTS,
  SURVEY_LIMITS,
  defaultConsentText,
  defaultPrivacyPolicyText,
  newSurveyQuestionId,
  sanVictorinoSurveyTemplate,
  type EventSurveyConfig,
  type EventSurveyQuestion,
  type SurveyPhoneConfig,
  type SurveyResponseRow,
} from "@/app/services/photo-booth/eventSurvey";

/** Clave de exportación de celulares, recordada solo en este navegador. */
const EXPORT_KEY_LS = "photobooth:survey-export-key";

/** Filas de la pestaña "Respuestas" que se pintan de a poco (el CSV las trae todas). */
const RESPONSES_PAGE = 100;

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

/** Opciones con texto (lo que de verdad se va a guardar, ver sanitizeSurveyConfig). */
function validOptions(q: EventSurveyQuestion) {
  return Array.from(new Set(q.options.map((o) => o.trim()).filter(Boolean)));
}

/**
 * Editor de la encuesta de la página de descarga. Edita la config "en crudo"
 * (las opciones son una por línea y pueden tener líneas vacías mientras se
 * escribe); la limpieza final la hace `sanitizeSurveyConfig` al guardar el
 * evento, que descarta preguntas sin texto o con menos de 2 opciones.
 */
export default function SurveyEditor({
  value,
  onChange,
}: {
  value: EventSurveyConfig;
  onChange: (next: EventSurveyConfig) => void;
}) {
  const questions = value.questions || [];

  const setText = (key: "title" | "intro" | "thankYouTitle" | "thankYouText" | "accentColor", v: string) =>
    onChange({ ...value, [key]: v });

  const updateQuestion = (idx: number, patch: Partial<EventSurveyQuestion>) =>
    onChange({
      ...value,
      questions: questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    });

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    [next[idx], next[to]] = [next[to], next[idx]];
    onChange({ ...value, questions: next });
  };

  const removeQuestion = (idx: number) => {
    if (!window.confirm("¿Eliminar esta pregunta?")) return;
    onChange({ ...value, questions: questions.filter((_, i) => i !== idx) });
  };

  const addQuestion = () =>
    onChange({
      ...value,
      questions: [...questions, { id: newSurveyQuestionId(), text: "", options: ["", ""] }],
    });

  const loadTemplate = () => {
    if (
      questions.length &&
      !window.confirm("Esto reemplaza los textos y preguntas actuales por la plantilla. ¿Continuar?")
    )
      return;
    onChange(sanVictorinoSurveyTemplate());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Hasta {SURVEY_LIMITS.questions} preguntas de {SURVEY_LIMITS.options} opciones.
        </p>
        <button
          type="button"
          onClick={loadTemplate}
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Cargar plantilla “San Victorino está fino”
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
          <input
            type="text" autoComplete="off"
            value={value.title || ""}
            onChange={(e) => setText("title", e.target.value)}
            placeholder={SURVEY_DEFAULTS.title}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color de acento</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.accentColor || SURVEY_DEFAULTS.accentColor}
              onChange={(e) => setText("accentColor", e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-gray-300"
              aria-label="Color de acento"
            />
            <span className="text-xs text-gray-500">Botones y opciones elegidas.</span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Texto introductorio</label>
        <textarea
          rows={2}
          value={value.intro || ""}
          onChange={(e) => setText("intro", e.target.value)}
          placeholder="Opcional. Se muestra bajo el título, solo en la primera pregunta."
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título de agradecimiento</label>
          <input
            type="text" autoComplete="off"
            value={value.thankYouTitle || ""}
            onChange={(e) => setText("thankYouTitle", e.target.value)}
            placeholder={SURVEY_DEFAULTS.thankYouTitle}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Texto de agradecimiento</label>
          <input
            type="text" autoComplete="off"
            value={value.thankYouText || ""}
            onChange={(e) => setText("thankYouText", e.target.value)}
            placeholder="Opcional"
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, idx) => {
          const opts = validOptions(q);
          const invalid = !q.text.trim() || opts.length < 2;
          return (
            <div
              key={q.id}
              className={`rounded-lg border p-3 space-y-2 ${invalid ? "border-amber-300 bg-amber-50/50" : "border-gray-200"}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 text-sm font-bold text-gray-500 w-5 shrink-0">{idx + 1}.</span>
                <input
                  type="text" autoComplete="off"
                  value={q.text}
                  onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                  placeholder="Texto de la pregunta"
                  className={inputCls}
                />
                <div className="flex shrink-0 items-center gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30"
                    aria-label="Subir pregunta"
                  >
                    <FaArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, 1)}
                    disabled={idx === questions.length - 1}
                    className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30"
                    aria-label="Bajar pregunta"
                  >
                    <FaArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(idx)}
                    className="p-1.5 text-red-500 hover:text-red-700"
                    aria-label="Eliminar pregunta"
                  >
                    <FaTrash className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="pl-7">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Opciones (una por línea)
                </label>
                <textarea
                  rows={Math.min(Math.max(q.options.length, 3), SURVEY_LIMITS.options)}
                  value={q.options.join("\n")}
                  onChange={(e) => updateQuestion(idx, { options: e.target.value.split("\n") })}
                  className={inputCls}
                />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.multiple === true}
                      onChange={(e) => updateQuestion(idx, { multiple: e.target.checked || undefined })}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    Permitir varias respuestas
                  </label>
                  {invalid && (
                    <span className="text-xs text-amber-700">
                      Necesita texto y al menos 2 opciones; si no, no se guarda.
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        disabled={questions.length >= SURVEY_LIMITS.questions}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-dashed border-gray-300 text-gray-700 hover:border-gray-400 disabled:opacity-40"
      >
        <FaPlus className="w-3 h-3" /> Agregar pregunta
      </button>

      <PhoneStepEditor
        value={value.phone || {}}
        onChange={(phone) => onChange({ ...value, phone })}
      />
    </div>
  );
}

/** Paso final opcional: celular + autorización + política de privacidad. */
function PhoneStepEditor({
  value,
  onChange,
}: {
  value: SurveyPhoneConfig;
  onChange: (next: SurveyPhoneConfig) => void;
}) {
  const set = <K extends keyof SurveyPhoneConfig>(key: K, v: SurveyPhoneConfig[K]) =>
    onChange({ ...value, [key]: v });
  const controller = value.controllerName?.trim() || "";
  const missingController = value.enabled && !controller;

  const loadPolicyTemplate = () => {
    if (!controller) {
      window.alert("Primero escribe el responsable del tratamiento: la plantilla lo nombra.");
      return;
    }
    if (value.privacyPolicyText?.trim() && !window.confirm("¿Reemplazar el texto actual de la política?")) return;
    set("privacyPolicyText", defaultPrivacyPolicyText(controller, value.controllerContact?.trim()));
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3 sm:p-4 space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value.enabled === true}
          onChange={(e) => set("enabled", e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <span>
          <span className="block text-sm font-semibold text-gray-800">
            Paso final: pedir el celular (opcional para la persona)
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Después de la última pregunta. Solo se guarda si la persona marca la autorización de
            tratamiento de datos (Ley 1581 de 2012); se guarda también el texto exacto que aceptó.
            Dejarlo vacío nunca impide enviar la encuesta ni descargar la foto.
          </span>
        </span>
      </label>

      {value.enabled && (
        <>
          {missingController && (
            <p className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              Sin responsable del tratamiento el paso del celular NO se muestra: la ley exige
              informar quién recibe los datos.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsable del tratamiento *
              </label>
              <input
                type="text" autoComplete="off"
                value={value.controllerName || ""}
                onChange={(e) => set("controllerName", e.target.value)}
                placeholder="Ej. Centro Comercial Gran San S.A.S."
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contacto para ejercer derechos
              </label>
              <input
                type="text" autoComplete="off"
                value={value.controllerContact || ""}
                onChange={(e) => set("controllerContact", e.target.value)}
                placeholder="Ej. datospersonales@empresa.com"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título del paso</label>
            <input
              type="text" autoComplete="off"
              value={value.label || ""}
              onChange={(e) => set("label", e.target.value)}
              placeholder={SURVEY_DEFAULTS.phoneLabel}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Texto de la autorización (casilla)
            </label>
            <textarea
              rows={3}
              value={value.consentText || ""}
              onChange={(e) => set("consentText", e.target.value)}
              placeholder={defaultConsentText(controller || "[responsable]")}
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">
              Vacío = el texto gris de ejemplo. Debe decir para qué se usará el número.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Política de privacidad: URL externa
            </label>
            <input
              type="url"
              value={value.privacyPolicyUrl || ""}
              onChange={(e) => set("privacyPolicyUrl", e.target.value)}
              placeholder="https://www.empresa.com/politica-de-datos"
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">
              Si el responsable ya tiene su política publicada, pon el enlace aquí y se usa ese.
            </p>
          </div>

          {!value.privacyPolicyUrl?.trim() && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Política de privacidad: texto en la página
                </label>
                <button
                  type="button"
                  onClick={loadPolicyTemplate}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Cargar plantilla para editar
                </button>
              </div>
              <textarea
                rows={8}
                value={value.privacyPolicyText || ""}
                onChange={(e) => set("privacyPolicyText", e.target.value)}
                placeholder="Vacío = se muestra la plantilla con el responsable y el contacto de arriba."
                className={inputCls}
              />
              <p className="text-xs text-gray-500 mt-1">
                Se despliega en la misma página al tocar &quot;Ver política de privacidad&quot;. La
                plantilla es una base: conviene que el responsable la revise con su área legal.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  // BOM: sin él Excel abre el archivo en ANSI y rompe las tildes.
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Resumen de respuestas del evento (conteo por opción) + CSV. Las preguntas
 * salen de la config actual; las que ya no existen pero tienen respuestas
 * guardadas se agregan al final con el texto que tenían al responderse.
 */
export function SurveyResultsPanel({
  eventId,
  eventSlug,
  survey,
}: {
  eventId: string;
  eventSlug?: string;
  survey: EventSurveyConfig;
}) {
  const [rows, setRows] = useState<SurveyResponseRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneInfo, setPhoneInfo] = useState({ count: 0, withPhones: false, keyConfigured: false });
  const [exportKey, setExportKey] = useState("");
  const [view, setView] = useState<"summary" | "responses">("summary");
  const [visibleCount, setVisibleCount] = useState(RESPONSES_PAGE);

  useEffect(() => {
    try {
      setExportKey(localStorage.getItem(EXPORT_KEY_LS) || "");
    } catch {
      // almacenamiento bloqueado: se escribe la clave cada vez
    }
  }, []);

  const load = useCallback(
    async (key?: string) => {
      setLoading(true);
      setError(null);
      const url = `/api/survey-responses?eventId=${encodeURIComponent(eventId)}`;
      try {
        let res = await fetch(url, {
          cache: "no-store",
          headers: key ? { "x-export-key": key } : undefined,
        });
        let wrongKey = false;
        if (res.status === 401 && key) {
          // Clave vieja o mal escrita: se olvida y se muestra lo que no la necesita.
          wrongKey = true;
          key = undefined;
          try {
            localStorage.removeItem(EXPORT_KEY_LS);
          } catch {
            // ignore
          }
          res = await fetch(url, { cache: "no-store" });
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Error al cargar");
        if (wrongKey) setError("Clave de exportación incorrecta.");
        setRows(data.rows || []);
        setPhoneInfo({
          count: data.phoneCount || 0,
          withPhones: data.withPhones === true,
          keyConfigured: data.keyConfigured === true,
        });
        if (key) {
          try {
            localStorage.setItem(EXPORT_KEY_LS, key);
          } catch {
            // sin almacenamiento: no se recuerda, nada más
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    let key = "";
    try {
      key = localStorage.getItem(EXPORT_KEY_LS) || "";
    } catch {
      // ignore
    }
    load(key || undefined);
  }, [load]);

  const summary = useMemo(() => {
    const questions: { id: string; text: string; options: string[] }[] = (survey.questions || []).map(
      (q) => ({ id: q.id, text: q.text, options: validOptions(q) })
    );
    const counts: Record<string, Record<string, number>> = {};
    const answered: Record<string, number> = {};

    for (const row of rows || []) {
      for (const a of row.answers) {
        let q = questions.find((qq) => qq.id === a.questionId);
        if (!q) {
          q = { id: a.questionId, text: a.question, options: [] };
          questions.push(q);
        }
        answered[q.id] = (answered[q.id] || 0) + 1;
        counts[q.id] ||= {};
        for (const opt of a.selected) {
          if (!q.options.includes(opt)) q.options.push(opt);
          counts[q.id][opt] = (counts[q.id][opt] || 0) + 1;
        }
      }
    }
    return { questions, counts, answered };
  }, [rows, survey.questions]);

  const completedCount = (rows || []).filter((r) => r.completed).length;

  const exportCsv = () => {
    if (!rows) return;
    const withPhones = phoneInfo.withPhones;
    const header = [
      "Fecha",
      "Estado",
      "Foto (taskId)",
      ...(withPhones ? ["Celular (autorizado)"] : []),
      ...summary.questions.map((q) => q.text),
    ];
    const body = rows.map((r) => [
      r.createdAt ? new Date(r.createdAt).toLocaleString("es-CO") : "",
      r.completed ? "Completa" : "Parcial",
      r.taskId || "",
      ...(withPhones ? [r.phone || ""] : []),
      ...summary.questions.map(
        (q) => r.answers.find((a) => a.questionId === q.id)?.selected.join(" | ") || ""
      ),
    ]);
    downloadCsv(`encuesta-${eventSlug || eventId}.csv`, [header, ...body]);
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-800">
            Resultados {rows ? `· ${rows.length} persona${rows.length === 1 ? "" : "s"}` : ""}
          </h4>
          {rows && rows.length > 0 && (
            <p className="text-xs text-gray-500">
              {completedCount} completa{completedCount === 1 ? "" : "s"} ·{" "}
              {rows.length - completedCount} parcial{rows.length - completedCount === 1 ? "" : "es"}{" "}
              (contestaron algunas preguntas sin tocar &quot;Enviar&quot;; cada respuesta se guarda al
              contestarla)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(exportKey || undefined)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FaSync className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows?.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <FaDownload className="w-3 h-3" /> CSV
          </button>
        </div>
      </div>

      {rows && (
        <div className="rounded-md bg-gray-50 border border-gray-200 p-2.5 text-xs text-gray-700 space-y-2">
          <p>
            <strong>{phoneInfo.count}</strong> persona{phoneInfo.count === 1 ? "" : "s"} dejaron su
            celular con autorización.{" "}
            {phoneInfo.withPhones
              ? "Los números se ven en “Respuestas” y se incluyen en el CSV."
              : "Por privacidad, los números solo se incluyen en el CSV con la clave de exportación."}
          </p>
          {!phoneInfo.withPhones &&
            (phoneInfo.keyConfigured ? (
              // Sin <form>: dentro de "Editar evento" este panel ya vive en el
              // formulario del evento, y un form anidado (o Enter) lo enviaría.
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={exportKey}
                  onChange={(e) => setExportKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      load(exportKey.trim() || undefined);
                    }
                  }}
                  placeholder="Clave de exportación"
                  autoComplete="off"
                  className="flex-1 min-w-40 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md"
                />
                <button
                  type="button"
                  onClick={() => load(exportKey.trim() || undefined)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-white hover:bg-gray-900"
                >
                  Desbloquear celulares
                </button>
              </div>
            ) : (
              <p className="text-amber-700">
                Falta configurar la variable SURVEY_EXPORT_KEY en el servidor (Netlify) para poder
                exportar los celulares.
              </p>
            ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && rows.length === 0 && !error && (
        <p className="text-sm text-gray-500">Todavía no hay respuestas.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {(
            [
              ["summary", "Resumen"],
              ["responses", `Respuestas (${rows.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {rows && rows.length > 0 && view === "responses" && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Fecha</th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Estado</th>
                  {phoneInfo.withPhones && (
                    <th className="px-2.5 py-2 font-semibold whitespace-nowrap">Celular</th>
                  )}
                  {summary.questions.map((q, i) => (
                    <th key={q.id} className="px-2.5 py-2 font-semibold min-w-44" title={q.text}>
                      {i + 1}. {q.text}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, visibleCount).map((r) => (
                  <tr key={r.id} className="align-top hover:bg-gray-50">
                    <td className="px-2.5 py-2 whitespace-nowrap text-gray-500 tabular-nums">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString("es-CO") : "—"}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          r.completed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {r.completed ? "Completa" : "Parcial"}
                      </span>
                    </td>
                    {phoneInfo.withPhones && (
                      <td className="px-2.5 py-2 whitespace-nowrap tabular-nums text-gray-800">
                        {r.phone || "—"}
                      </td>
                    )}
                    {summary.questions.map((q) => (
                      <td key={q.id} className="px-2.5 py-2 text-gray-800">
                        {r.answers.find((a) => a.questionId === q.id)?.selected.join(", ") || (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + RESPONSES_PAGE)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Ver {Math.min(RESPONSES_PAGE, rows.length - visibleCount)} más (de {rows.length - visibleCount} restantes)
            </button>
          )}
        </div>
      )}

      {rows && rows.length > 0 && view === "summary" && (
        <div className="space-y-4">
          {summary.questions.map((q) => {
            const n = summary.answered[q.id] || 0;
            return (
              <div key={q.id}>
                <p className="text-sm font-medium text-gray-800">
                  {q.text} <span className="text-xs font-normal text-gray-500">({n})</span>
                </p>
                <ul className="mt-1.5 space-y-1">
                  {q.options.map((opt) => {
                    const c = summary.counts[q.id]?.[opt] || 0;
                    const pct = n ? Math.round((c / n) * 100) : 0;
                    return (
                      <li key={opt} className="text-xs text-gray-700">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{opt}</span>
                          <span className="shrink-0 tabular-nums text-gray-500">
                            {c} · {pct}%
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
