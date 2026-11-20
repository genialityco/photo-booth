"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SURVEY_DEFAULTS,
  getActivePhoneStep,
  isValidSurveyResponseId,
  newSurveyResponseId,
  normalizeColombianMobile,
  normalizePersonName,
  type EventSurveyConfig,
  type SurveyAnswers,
} from "@/app/services/photo-booth/eventSurvey";

/** Pausa antes de avanzar solo tras tocar una opción de selección única:
 * lo justo para que se vea marcada. */
const AUTO_ADVANCE_MS = 320;

function doneKey(eventId: string) {
  return `photobooth:survey-done:${eventId}`;
}

function readDone(eventId: string): boolean {
  try {
    return localStorage.getItem(doneKey(eventId)) === "1";
  } catch {
    return false;
  }
}

function markDone(eventId: string) {
  try {
    localStorage.setItem(doneKey(eventId), "1");
  } catch {
    // modo privado / almacenamiento bloqueado: solo se volvería a ofrecer
  }
}

/** Espera tras el último toque antes de guardar: agrupa los toques rápidos
 * de una pregunta múltiple en un solo envío. */
const SAVE_DEBOUNCE_MS = 400;

function progressKey(eventId: string) {
  return `photobooth:survey-progress:${eventId}`;
}

/** Respuesta a medias de este celular (para retomarla al recargar). */
function readProgress(
  eventId: string
): { responseId: string; answers: SurveyAnswers; step: number } | null {
  try {
    const raw = localStorage.getItem(progressKey(eventId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!isValidSurveyResponseId(p?.responseId) || !p.answers || typeof p.answers !== "object") {
      return null;
    }
    const answers: SurveyAnswers = {};
    for (const [k, v] of Object.entries(p.answers)) {
      if (Array.isArray(v)) answers[k] = v.filter((s): s is string => typeof s === "string");
    }
    return { responseId: p.responseId, answers, step: Number(p.step) || 0 };
  } catch {
    return null;
  }
}

function clearProgress(eventId: string) {
  try {
    localStorage.removeItem(progressKey(eventId));
  } catch {
    // ignore
  }
}

/**
 * Encuesta opcional bajo la descarga de `/survey`. Una pregunta a la vez con
 * botones grandes (se responde con el pulgar, en la calle): en selección
 * única tocar una opción ya avanza. Si el evento lo pide, un último paso
 * ofrece dejar el celular, con autorización de datos y política de
 * privacidad; dejarlo vacío es válido. Nunca bloquea la descarga, y si falla
 * el envío solo lo dice — la foto sigue disponible arriba.
 *
 * Quien ya respondió en este celular (mismo evento) ve el agradecimiento en
 * vez de la encuesta, aunque escanee otra foto.
 */
export default function EventSurveyCard({
  id,
  eventId,
  taskId,
  survey,
}: {
  id?: string;
  eventId: string;
  taskId?: string;
  survey: EventSurveyConfig;
}) {
  const accent = survey.accentColor || SURVEY_DEFAULTS.accentColor;
  const questions = survey.questions;
  const phoneStep = useMemo(() => getActivePhoneStep(survey), [survey]);
  const totalSteps = questions.length + (phoneStep ? 1 : 0);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const advanceTimer = useRef<number | null>(null);

  // --- Guardado por pregunta -------------------------------------------
  // Cada cambio de respuestas se manda entero (todas las contestadas hasta
  // ahora) sobre el mismo `responseId`. Los envíos van de a uno: si llega un
  // cambio con otro en vuelo, se marca `dirty` y al terminar se manda el
  // estado más reciente — así uno viejo nunca pisa a uno nuevo.
  const responseIdRef = useRef<string>("");
  const answersRef = useRef<SurveyAnswers>({});
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const restoredRef = useRef(false);
  const finishedRef = useRef(false);
  /** Ya existe el doc en el servidor (guardado ok, o retomado de antes). */
  const savedOnceRef = useRef(false);
  const stepRef = useRef(0);
  stepRef.current = step;

  const hasAnyAnswer = (a: SurveyAnswers) => Object.values(a).some((v) => v.length > 0);

  const payload = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      eventId,
      taskId,
      responseId: responseIdRef.current,
      answers: answersRef.current,
      ...extra,
    });

  const persistProgress = () => {
    try {
      localStorage.setItem(
        progressKey(eventId),
        JSON.stringify({
          responseId: responseIdRef.current,
          answers: answersRef.current,
          step: stepRef.current,
        })
      );
    } catch {
      // sin almacenamiento: no se retoma al recargar, lo demás sigue igual
    }
  };

  const savePartial = async () => {
    if (finishedRef.current) return;
    // Sin nada contestado y sin doc en el servidor todavía, no hay qué guardar
    // (con doc, sí: desmarcar todo también se guarda).
    if (!hasAnyAnswer(answersRef.current) && !savedOnceRef.current) return;
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }
    savingRef.current = true;
    dirtyRef.current = false;
    setAutosave("saving");
    try {
      const res = await fetch("/api/survey-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload(),
      });
      if (res.ok) savedOnceRef.current = true;
      setAutosave(res.ok ? "saved" : "error");
    } catch {
      setAutosave("error");
    } finally {
      savingRef.current = false;
      if (dirtyRef.current && !finishedRef.current) void savePartial();
    }
  };

  // Al montar: ya respondida → agradecimiento; a medias → se retoma donde iba
  // (misma respuesta en el servidor); nueva → id nuevo.
  useEffect(() => {
    if (readDone(eventId)) {
      finishedRef.current = true;
      setStatus("done");
      return;
    }
    const saved = readProgress(eventId);
    if (saved) {
      responseIdRef.current = saved.responseId;
      answersRef.current = saved.answers;
      savedOnceRef.current = hasAnyAnswer(saved.answers);
      setAnswers(saved.answers);
      setStep(Math.min(saved.step, Math.max(0, totalSteps - 1)));
    } else {
      responseIdRef.current = newSurveyResponseId();
    }
    restoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    answersRef.current = answers;
    if (!restoredRef.current || finishedRef.current) return;
    persistProgress();
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void savePartial();
    }, SAVE_DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  useEffect(() => {
    if (restoredRef.current && !finishedRef.current) persistProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Si cierra la pestaña o cambia de app con un guardado pendiente, se manda
  // igual (keepalive sobrevive a la descarga de la página).
  useEffect(() => {
    const flush = () => {
      if (!saveTimer.current || finishedRef.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (!hasAnyAnswer(answersRef.current)) return;
      try {
        void fetch("/api/survey-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload(),
          keepalive: true,
        });
      } catch {
        // la página se está yendo: no hay nada más que hacer
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, taskId]);

  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    []
  );

  const onPhoneStep = !!phoneStep && step === questions.length;
  const q = questions[Math.min(step, questions.length - 1)];
  const selected = answers[q.id] || [];
  const isLastStep = step === totalSteps - 1;
  const answeredCount = questions.filter((qq) => (answers[qq.id] || []).length > 0).length;

  const phoneTyped = phone.trim() !== "";
  const phoneValid = !phoneTyped || normalizeColombianMobile(phone) !== null;
  const askName = !!phoneStep?.askName;
  const nameTyped = askName && name.trim() !== "";
  const nameValid = !nameTyped || normalizePersonName(name) !== null;
  /** Escribió algún dato personal: desde ahí hace falta la autorización. */
  const contactTyped = phoneTyped || nameTyped;
  const phoneBlocksSubmit = contactTyped && (!phoneValid || !nameValid || !consent);

  const goNext = () => setStep((s) => Math.min(s + 1, totalSteps - 1));

  const toggleOption = (option: string) => {
    if (status === "sending") return;
    if (q.multiple) {
      setAnswers((prev) => {
        const cur = prev[q.id] || [];
        const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
        return { ...prev, [q.id]: next };
      });
      return;
    }
    setAnswers((prev) => ({ ...prev, [q.id]: [option] }));
    if (!isLastStep) {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      advanceTimer.current = window.setTimeout(goNext, AUTO_ADVANCE_MS);
    }
  };

  /** "Enviar": cierra la respuesta (ya guardada pregunta a pregunta) y es el
   * único guardado que lleva el celular. Un guardado parcial que llegue
   * después al servidor se descarta: la respuesta enviada queda cerrada. */
  const submit = async () => {
    if (phoneBlocksSubmit) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    answersRef.current = answers;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/survey-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload({
          complete: true,
          ...(phoneStep && contactTyped
            ? {
                ...(phoneTyped ? { phone: phone.trim() } : {}),
                ...(nameTyped ? { name: name.trim() } : {}),
                consent,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo enviar");
      }
      finishedRef.current = true;
      markDone(eventId);
      clearProgress(eventId);
      setStatus("done");
    } catch (e) {
      setErrorMsg(
        e instanceof Error && e.message ? `${e.message}.` : "No se pudo enviar. Revisa tu conexión."
      );
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <section
        id={id}
        className="mt-5 rounded-2xl border border-white/15 bg-black/70 backdrop-blur-md shadow-xl p-5 md:p-6 text-center"
        aria-live="polite"
      >
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-white"
          style={{ backgroundColor: accent }}
          aria-hidden
        >
          ✓
        </div>
        <h2 className="text-xl md:text-2xl font-extrabold text-white">
          {survey.thankYouTitle || SURVEY_DEFAULTS.thankYouTitle}
        </h2>
        {survey.thankYouText && (
          <p className="mt-2 text-white/90 text-sm md:text-base">{survey.thankYouText}</p>
        )}
      </section>
    );
  }

  const canGoNext = onPhoneStep || selected.length > 0;
  const progressDone = step + (onPhoneStep || selected.length > 0 ? 1 : 0);

  return (
    <section
      id={id}
      className="mt-5 rounded-2xl border border-white/15 bg-black/70 backdrop-blur-md shadow-xl p-5 md:p-6 scroll-mt-4"
    >
      <header className="mb-4">
        <h2 className="text-xl md:text-2xl font-extrabold text-white leading-tight">
          {survey.title || SURVEY_DEFAULTS.title}
        </h2>
        {survey.intro && step === 0 && (
          <p className="mt-2 text-sm text-white/90">{survey.intro}</p>
        )}
      </header>

      {totalSteps > 1 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-white/85 mb-1.5">
            <span>{onPhoneStep ? "Último paso" : `Pregunta ${step + 1} de ${questions.length}`}</span>
            <span aria-live="polite">
              {autosave === "saving"
                ? "Guardando…"
                : autosave === "saved"
                  ? "Respuestas guardadas ✓"
                  : "Opcional"}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${(progressDone / totalSteps) * 100}%`, backgroundColor: accent }}
            />
          </div>
        </div>
      )}

      {onPhoneStep && phoneStep ? (
        <div key="phone" className="animate-fadeIn">
          <p className="block text-base md:text-lg font-bold text-white mb-1">{phoneStep.label}</p>
          <p className="text-xs text-white/85 mb-3">
            {askName ? "Es opcional: puedes dejarlos vacíos y enviar." : "Es opcional: puedes dejarlo vacío y enviar."}
          </p>

          {askName && (
            <>
              <label htmlFor="survey-name" className="block text-sm font-semibold text-white mb-1">
                {phoneStep.nameLabel}
              </label>
              <input
                id="survey-name"
                type="text"
                autoComplete="name"
                autoCapitalize="words"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre y apellido"
                maxLength={80}
                disabled={status === "sending"}
                aria-invalid={!nameValid}
                className="w-full min-h-12 rounded-xl border border-white/25 bg-white/95 px-4 text-lg text-black placeholder-black/35 focus:outline-none focus:ring-2"
                style={{ ["--tw-ring-color" as string]: accent }}
              />
              {!nameValid && (
                <p className="mt-1.5 text-xs text-amber-200">Escribe tu nombre solo con letras (ej. Ana Gómez).</p>
              )}
              <label htmlFor="survey-phone" className="mt-3 block text-sm font-semibold text-white mb-1">
                Celular
              </label>
            </>
          )}
          <input
            id="survey-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="300 123 4567"
            maxLength={20}
            disabled={status === "sending"}
            aria-invalid={!phoneValid}
            aria-label={askName ? undefined : phoneStep.label}
            className="w-full min-h-12 rounded-xl border border-white/25 bg-white/95 px-4 text-lg text-black placeholder-black/35 focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as string]: accent }}
          />
          {!phoneValid && (
            <p className="mt-1.5 text-xs text-amber-200">
              Escribe un celular colombiano de 10 dígitos (ej. 300 123 4567).
            </p>
          )}

          {contactTyped && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded"
                style={{ accentColor: accent }}
              />
              <span className="text-xs leading-relaxed text-white/90">{phoneStep.consentText}</span>
            </label>
          )}

          <div className="mt-2">
            {phoneStep.privacyPolicyUrl ? (
              <a
                href={phoneStep.privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-white underline underline-offset-2"
              >
                Ver política de privacidad
              </a>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowPolicy((v) => !v)}
                  aria-expanded={showPolicy}
                  className="text-xs font-semibold text-white underline underline-offset-2"
                >
                  {showPolicy ? "Ocultar política de privacidad" : "Ver política de privacidad"}
                </button>
                {showPolicy && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/15 bg-black/60 p-3 text-xs leading-relaxed text-white/90 whitespace-pre-line">
                    {phoneStep.privacyPolicyText}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <fieldset key={q.id} className="animate-fadeIn">
          <legend className="text-base md:text-lg font-bold text-white mb-1">{q.text}</legend>
          {q.multiple && <p className="text-xs text-white/85 mb-2">Puedes elegir varias.</p>}
          <div className="mt-2 grid gap-2">
            {q.options.map((option) => {
              const on = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleOption(option)}
                  aria-pressed={on}
                  disabled={status === "sending"}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm md:text-base font-medium transition active:scale-[0.99] ${
                    on ? "text-white" : "border-white/25 bg-white/10 text-white hover:bg-white/15"
                  }`}
                  style={on ? { borderColor: accent, backgroundColor: `${accent}33` } : undefined}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                      q.multiple ? "rounded-md" : "rounded-full"
                    }`}
                    style={{
                      borderColor: on ? accent : "rgba(255,255,255,0.5)",
                      backgroundColor: on ? accent : "transparent",
                    }}
                    aria-hidden
                  >
                    {on && <span className="text-[11px] leading-none text-white">✓</span>}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {status === "error" && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-200" role="alert">
          {errorMsg} Tu foto sigue disponible arriba.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={`px-3 py-2 text-sm font-medium text-white/85 hover:text-white ${step === 0 ? "invisible" : ""}`}
        >
          ← Atrás
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={submit}
            disabled={answeredCount === 0 || status === "sending" || phoneBlocksSubmit}
            className="min-h-12 rounded-xl px-6 py-2.5 font-bold text-white shadow transition disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            {status === "sending" ? "Enviando…" : status === "error" ? "Reintentar" : "Enviar respuestas"}
          </button>
        ) : (
          (q.multiple || canGoNext) && (
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="min-h-12 rounded-xl px-6 py-2.5 font-bold text-white shadow transition disabled:opacity-40"
              style={{ backgroundColor: accent }}
            >
              Siguiente →
            </button>
          )
        )}
      </div>

      {onPhoneStep && contactTyped && phoneValid && nameValid && !consent && (
        <p className="mt-2 text-right text-xs text-white/90">
          {askName
            ? "Marca la autorización para enviar tus datos, o bórralos para enviar sin ellos."
            : "Marca la autorización para enviar tu celular, o bórralo para enviar sin él."}
        </p>
      )}
    </section>
  );
}
