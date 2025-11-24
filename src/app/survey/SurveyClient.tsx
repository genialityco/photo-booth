/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/survey/SurveyClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type QRResponse =
  | { ok: true; dataUrl: string; kind: "raw" | "framed" }
  | { error: string };

export default function SurveyClient() {
  const sp = useSearchParams();

  const src = sp.get("src");
  const qrId = sp.get("qrId");
  const kindQS = sp.get("kind");
  const filenameFromQS = sp.get("filename") || undefined;

  // Permitimos también "video"
  const kind = (kindQS as "raw" | "framed" | "video" | null) || undefined;

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

  const [sending] = useState(false); // ya no enviamos nada
  const [saved, setSaved] = useState(false);

  const [downloadHref, setDownloadHref] = useState<string>("");
  const [downloadName, setDownloadName] = useState<string>("");
  const revokeRef = useRef<null | (() => void)>(null);

  // Detectar si es video: preferimos el kind=video, y si no, inferimos por extensión
  const isVideo = useMemo(() => {
    if (kind === "video") return true;
    const srcLower = (src || "").toLowerCase();
    if (
      srcLower.endsWith(".mp4") ||
      srcLower.endsWith(".webm") ||
      srcLower.endsWith(".mov")
    ) {
      return true;
    }
    return false;
  }, [kind, src]);

  const suggestedName = useMemo(() => {
    if (filenameFromQS) return filenameFromQS;

    const base =
      kind === "framed"
        ? "foto-con-marco"
        : isVideo
        ? "video-ia"
        : "foto-sin-marco";

    const t = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = isVideo ? "mp4" : "png";
    return `${base}-${t}.${ext}`;
  }, [filenameFromQS, kind, isVideo]);

  // Helpers imagen
  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

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

  const composeFramed = async (baseUrl: string) => {
    const [baseImg, frameImg] = await Promise.all([
      loadImage(baseUrl),
      loadImage("/suRed/MARCO_UM_RECUERDO.png"),
    ]);
    const size = 1024; // coincide con el PNG del marco
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    drawCover(ctx, baseImg, size);
    ctx.drawImage(frameImg, 0, 0, size, size);

    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/png")
    );
    if (!blob) throw new Error("No se pudo generar la imagen con marco.");
    const url = URL.createObjectURL(blob);
    return url;
  };

  // Cargar foto/video desde src o qrId
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

  // Preparar enlace de descarga (video directo o imagen con marco)
  useEffect(() => {
    let active = true;
    (async () => {
      if (loadingPhoto || !photo) return;

      if (revokeRef.current) {
        revokeRef.current();
        revokeRef.current = null;
      }

      try {
        if (isVideo) {
          // VIDEO: no componemos, usamos la URL tal cual
          const href = photo;
          if (!active) return;
          setDownloadHref(href);
          setDownloadName(filenameFromQS || suggestedName);
          setSaved(true);
          // no hay blob que revocar aquí
          return;
        }

        // IMAGEN: componemos con marco
        const framedUrl = await composeFramed(photo);
        if (!active) {
          URL.revokeObjectURL(framedUrl);
          return;
        }
        setDownloadHref(framedUrl);
        setDownloadName(filenameFromQS || suggestedName);
        setSaved(true);

        revokeRef.current = () => URL.revokeObjectURL(framedUrl);
      } catch (e: any) {
        console.error(e);
        setErr(e.message || "No se pudo preparar la imagen con marco.");
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPhoto, photo, filenameFromQS, suggestedName, isVideo]);

  const canDownload = !!downloadHref && !loadingPhoto && saved;

  return (
    <div className="min-h-screen w-full flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-3xl">
        <header className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            {isVideo ? "Descarga tu video 🎥" : "Descarga tu imagen 📸"}
          </h1>
          <p className="text-white/80 mt-2 max-w-2xl mx-auto">
            Tu {isVideo ? "video" : "imagen"} se preparará automáticamente
          </p>
        </header>

        {loadingPhoto && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 text-white/80">
            Preparando tu {isVideo ? "video" : "imagen"}…
          </div>
        )}
        {err && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {err}
          </div>
        )}

        {/* SOLO DESCARGA */}
        <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={canDownload ? downloadHref : undefined}
              download={downloadName || suggestedName}
              className={`px-4 py-2 rounded-xl font-semibold shadow transition
                ${
                  canDownload
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg.white/40 text-black/60 cursor-not-allowed"
                }
              `}
              aria-disabled={!canDownload}
              title={
                !canDownload
                  ? `Esperando a que el ${
                      isVideo ? "video" : "imagen"
                    } esté listo…`
                  : `Descargar ${isVideo ? "video" : "imagen"}`
              }
            >
              {isVideo ? "Descargar video" : "Descargar imagen"}
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

          {/* Vista previa */}
          {canDownload && (
            <div className="mt-4 w-full bg-white/5 rounded-xl p-3 border border.white/10 relative aspect-square overflow-hidden">
              {isVideo ? (
                <video
                  src={photo}
                  className="absolute inset-0 w-full h-full object.contain rounded-lg select-none"
                  autoPlay
                  loop
                  controls
                  playsInline
                />
              ) : (
                <>
                  <img
                    src={photo}
                    alt="Tu imagen"
                    className="absolute inset-0 w-full h-full object-contain rounded-lg select-none"
                    draggable={false}
                  />
                  <img
                    src="/suRed/MARCO_UM_RECUERDO.png"
                    alt="Marco decorativo"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                    draggable={false}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
