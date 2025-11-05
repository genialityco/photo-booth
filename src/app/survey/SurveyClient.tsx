/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/survey/SurveyClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
// ⬇️ Ya no guardamos en base, así que puedes comentar/retirar estos imports si no se usan
// import { createSurveyRecord, createSurveyRecordQuick } from "../services/surveyServices";

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

  // ⬇️ Estado del formulario preservado por si luego lo reactivas (no se usa ahora)
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    correo: "",
    cargo: "",
    empresa: "",
  });

  const [sending] = useState(false); // ya no enviamos nada
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

  // ⬇️ Helpers NUEVOS para componer con marco en cliente (no remuevas ni cambies tus comentarios)
  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      // Si la imagen proviene de un bucket/CDN, esto ayuda a evitar canvas "tainted"
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  // Dibuja la imagen tipo "cover" dentro de un lienzo cuadrado
  const drawCover = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    size: number
  ) => {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.max(size / iw, size / ih); // cover
    const dw = iw * s;
    const dh = ih * s;
    const dx = (size - dw) / 2;
    const dy = (size - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  // Compone la foto + el marco y devuelve un blob URL listo para descargar
  const composeFramed = async (baseUrl: string) => {
    const [baseImg, frameImg] = await Promise.all([
      loadImage(baseUrl),
      loadImage("/Colombia4.0/MARCO_IA_4.0.png"),
    ]);
    const size = 1024; // coincide con el PNG del marco
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    // Primero la foto (cover en el cuadrado) y luego el marco encima
    drawCover(ctx, baseImg, size);
    ctx.drawImage(frameImg, 0, 0, size, size);

    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/png")
    );
    if (!blob) throw new Error("No se pudo generar la imagen con marco.");
    const url = URL.createObjectURL(blob);
    return url;
  };

  // Carga de la imagen (igual que antes)
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

  // ⬇️ NUEVO: cuando la imagen esté lista, “simulamos” el estado posterior al envío
  // y preparamos el enlace de descarga.
  useEffect(() => {
    let active = true;
    (async () => {
      if (loadingPhoto || !photo) return;

      // Limpieza de blobs previos si la tuvieses
      if (revokeRef.current) {
        revokeRef.current();
        revokeRef.current = null;
      }

      try {
        // 👉 Aquí componemos SIEMPRE la imagen con el marco para la descarga
        const framedUrl = await composeFramed(photo);
        if (!active) {
          URL.revokeObjectURL(framedUrl);
          return;
        }
        setDownloadHref(framedUrl);
        setDownloadName(filenameFromQS || suggestedName);
        setSaved(true);

        // Registra función para revocar este blob cuando cambie/desmonte
        revokeRef.current = () => URL.revokeObjectURL(framedUrl);
      } catch (e: any) {
        console.error(e);
        setErr(e.message || "No se pudo preparar la imagen con marco.");
      }
    })();

    return () => {
      active = false;
    };
    // Mantén las dependencias como están para respetar tu orden/comentarios
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPhoto, photo, filenameFromQS, suggestedName]);

  const canDownload = !!downloadHref && !loadingPhoto && saved;

  // ⬇️ Manejadores del formulario (comentados para uso futuro)
  /*
  const handleChange =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Lógica original de guardado con createSurveyRecord / createSurveyRecordQuick...
  };
  */

  return (
    <div className="min-h-screen w-full flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-3xl">
        <header className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Descarga tu imagen 📸
          </h1>
          <p className="text-white/80 mt-2 max-w-2xl mx-auto">
            Tu imagen se preparará automáticamente
          </p>
        </header>

        {loadingPhoto && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 text-white/80">
            Preparando tu imagen…
          </div>
        )}
        {err && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {err}
          </div>
        )}

        {/* ⬇️ FORMULARIO ORIGINAL (COMENTADO)
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
                className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
              >
                Enviar y habilitar descarga
              </button>
            </form>
          </div>
        )}
        */}

        {/* ⬇️ SOLO DESCARGA */}
        <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={canDownload ? downloadHref : undefined}
              download={downloadName || suggestedName}
              className={`px-4 py-2 rounded-xl font-semibold shadow transition
                ${
                  canDownload
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-white/40 text-black/60 cursor-not-allowed"
                }
              `}
              aria-disabled={!canDownload}
              title={
                !canDownload
                  ? "Esperando a que la imagen esté lista…"
                  : "Descargar imagen"
              }
            >
              Descargar imagen
            </a>
            {canDownload && (
              <span className="text-xs text-white/60">
                Nombre sugerido:{" "}
                <code className="text-white/80">
                  {downloadName || suggestedName}
                </code>
              </span>
            )}
          </div>

          {/* Vista previa opcional (déjala comentada si quieres SOLO el botón) */}

          {canDownload && (
            <div className="mt-4 w-full bg-white/5 rounded-xl p-3 border border-white/10 relative aspect-square overflow-hidden">
              {/* Imagen base */}
              <img
                src={photo}
                alt="Tu imagen"
                className="absolute inset-0 w-full h-full object-contain rounded-lg select-none"
                draggable={false}
              />
              {/* Marco superpuesto */}
              <img
                src="/Colombia4.0/MARCO_IA_4.0.png"
                alt="Marco decorativo"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
