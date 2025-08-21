/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/survey/SurveyClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSurveyRecord, createSurveyRecordQuick } from "../services/surveyServices";

type QRResponse =
  | { ok: true; dataUrl: string; kind: "raw" | "framed" }
  | { error: string };

export default function SurveyClient() {
  const sp = useSearchParams();

  const src = sp.get("src");
  const qrId = sp.get("qrId");
  const kind = (sp.get("kind") as "raw" | "framed") || undefined;
  const filenameFromQS = sp.get("filename") || undefined;

  const [photo, setPhoto] = useState<string>("");
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [err, setErr] = useState<string>("");

  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    correo: "",
    cargo: "",
    empresa: "",
  });

  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);

  const [downloadHref, setDownloadHref] = useState<string>("");
  const [downloadName, setDownloadName] = useState<string>("");
  const revokeRef = useRef<null | (() => void)>(null);

  const suggestedName = useMemo(() => {
    if (filenameFromQS) return filenameFromQS;
    const base = kind === "framed" ? "foto-con-marco" : "foto-sin-marco";
    const t = new Date().toISOString().replace(/[:.]/g, "-");
    return `${base}-${t}.png`;
  }, [filenameFromQS, kind]);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        if (src) {
          const absolute =
            src.startsWith("/") && typeof window !== "undefined"
              ? `${window.location.origin}${src}`
              : src;
          if (!abort) setPhoto(absolute);
          return;
        }
        if (qrId) {
          const res = await fetch(`/api/qr/${qrId}`, { cache: "no-store" });
          if (!res.ok) throw new Error("QR inválido o expirado.");
          const data = (await res.json()) as QRResponse;
          if ("error" in data) throw new Error(data.error);
          if (!abort) setPhoto(data.dataUrl);
          return;
        }
        throw new Error("No se encontró 'src' ni 'qrId' en la URL.");
      } catch (e: any) {
        if (!abort) setErr(e.message || "No se pudo cargar la imagen.");
      } finally {
        if (!abort) setLoadingPhoto(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [src, qrId]);

  const handleChange =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setErr("La imagen aún no está disponible. Intenta de nuevo en unos segundos.");
      return;
    }
    setSending(true);
    setErr("");
    setSaved(false);

    if (revokeRef.current) {
      revokeRef.current();
      revokeRef.current = null;
    }

    try {
      const isDataUrl = photo.startsWith("data:");

      if (isDataUrl) {
        await createSurveyRecord({
          qrId: qrId ?? (src ? "from-src" : "unknown"),
          kind,
          photoDataUrl: photo,
          nombre: form.nombre.trim(),
          telefono: form.telefono.trim(),
          correo: form.correo.trim(),
          cargo: form.cargo.trim(),
          empresa: form.empresa.trim(),
        });
      } else {
        await createSurveyRecordQuick({
          qrId: qrId ?? (src ? "from-src" : "unknown"),
          kind,
          photoUrl: photo,
          nombre: form.nombre.trim(),
          telefono: form.telefono.trim(),
          correo: form.correo.trim(),
          cargo: form.cargo.trim(),
          empresa: form.empresa.trim(),
        });
      }

      setDownloadHref(photo);
      setDownloadName(filenameFromQS || suggestedName);
      setSaved(true);
    } catch (e: any) {
      setErr(e.message || "No se pudo guardar la encuesta.");
    } finally {
      setSending(false);
    }
  };

  const canSubmit = !sending && !!photo && !loadingPhoto;

  return (
    <div className="min-h-screen w-full flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-3xl">
        <header className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            ¡Tu foto está casi lista! 📸
          </h1>
          <p className="text-white/80 mt-2 max-w-2xl mx-auto">
            Déjanos tus datos para habilitar la <strong>descarga de tu imagen</strong>.
          </p>
        </header>

        {!saved && loadingPhoto && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 text-white/80">
            Preparando tu imagen…
          </div>
        )}
        {!saved && err && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {err}
          </div>
        )}

        {!saved && (
          <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl p-5 md:p-6">
            <h2 className="text-xl font-bold text-white mb-1">Completa el formulario</h2>
            <p className="text-sm text-white/70 mb-4">
              Al enviar, te mostraremos tu foto y podrás descargarla.
            </p>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-white/80">Nombre</label>
                  <input
                    required
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/90 text-black placeholder-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.nombre}
                    onChange={handleChange("nombre")}
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/80">Teléfono</label>
                  <input
                    required
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/90 text-black placeholder-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.telefono}
                    onChange={handleChange("telefono")}
                    type="tel"
                    inputMode="tel"
                    placeholder="Ej. 3001234567"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-white/80">Correo</label>
                <input
                  required
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/90 text-black placeholder-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.correo}
                  onChange={handleChange("correo")}
                  type="email"
                  inputMode="email"
                  placeholder="tucorreo@ejemplo.com"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-white/80">Cargo</label>
                  <input
                    required
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/90 text-black placeholder-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.cargo}
                    onChange={handleChange("cargo")}
                    placeholder="Tu cargo"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/80">Empresa</label>
                  <input
                    required
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/90 text-black placeholder-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.empresa}
                    onChange={handleChange("empresa")}
                    placeholder="Nombre de la empresa"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className={`mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-white transition
                  ${canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-600/50 cursor-not-allowed"}
                `}
                title={!photo ? "Estamos preparando tu imagen…" : undefined}
              >
                {sending ? (
                  <>
                    <span className="inline-block animate-spin rounded-full border-2 border-white/40 border-t-white w-4 h-4" />
                    Guardando…
                  </>
                ) : (
                  "Enviar y habilitar descarga"
                )}
              </button>

              <p className="text-xs text-white/50 mt-1">
                Al enviar aceptas que usemos tus datos para contacto relacionado con esta actividad.
              </p>
            </form>
          </div>
        )}

        {saved && photo && (
          <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl p-5 md:p-6">
            <h3 className="text-lg md:text-xl font-bold text-white">¡Gracias! 🎉</h3>
            <p className="text-sm text-white/70 mt-1">
              Hemos registrado tu respuesta. Aquí tienes tu imagen:
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="w-full bg-white/5 rounded-xl p-3 border border-white/10">
                <img
                  src={photo}
                  alt="Tu imagen"
                  className="w-full h-auto object-contain rounded-lg"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={downloadHref}
                  download={downloadName || suggestedName}
                  className="px-4 py-2 rounded-xl bg-white text-black font-semibold hover:bg-white/90 shadow"
                >
                  Descargar imagen
                </a>
                <span className="text-xs text-white/50">
                  Nombre sugerido:{" "}
                  <code className="text-white/80">{downloadName || suggestedName}</code>
                </span>
              </div>

              <div className="pt-2">
                <a
                  href="/camera"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold bg-neutral-700 hover:bg-neutral-800 text-white"
                >
                  Tomar otra foto
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
