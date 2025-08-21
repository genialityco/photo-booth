/* eslint-disable @next/next/no-img-element */
// app/components/ResultView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import ButtonPrimary from "../items/ButtonPrimary";

import { getStorageOrThrow } from "../../firebaseConfig";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
function isHttpUrl(u?: string | null) {
  return !!u && (/^https?:\/\//.test(u) || u.startsWith("/"));
}
function absoluteFromMaybeRelative(url: string) {
  if (typeof window === "undefined") return url;
  return url.startsWith("/") ? `${window.location.origin}${url}` : url;
}
function makeFilename(base: string, suffix: string) {
  const b = slugify(base || "foto");
  return `${b}-${suffix}.png`;
}
function buildSurveyUrl(params: {
  src: string;
  filename?: string;
  kind: "framed" | "raw";
  final?: boolean;
  taskId?: string;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const q = new URLSearchParams();
  q.set("src", params.src);
  if (params.filename) q.set("filename", params.filename);
  q.set("kind", params.kind);
  if (params.final) q.set("final", "1");
  if (params.taskId) q.set("taskId", params.taskId);
  return `${origin}/survey?${q.toString()}`;
}
async function toBlob(input: string): Promise<Blob> {
  const res = await fetch(input, { cache: "no-store" });
  return await res.blob();
}

type Anchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

function handlePrintWithLayout(
  url: string,
  opts?: {
    pageWidthMm?: number; // tamaño de papel
    pageHeightMm?: number;
    marginMm?: number; // margen @page (suele ignorarse en algunas impresoras)
    anchor?: Anchor; // esquina o centro
    offsetXmm?: number; // desplazamiento desde el ancla en X
    offsetYmm?: number; // desplazamiento desde el ancla en Y
    imgWidthMm?: number; // tamaño de la imagen (si lo omites, usa auto)
    imgHeightMm?: number;
    closeDelayMs?: number;
  }
) {
  const {
    pageWidthMm = 100, // 4x6" aprox
    pageHeightMm = 150,
    marginMm = 0,
    anchor = "top-left",
    offsetXmm = 0,
    offsetYmm = 0,
    imgWidthMm, // si defines width/height, la imagen tendrá ese tamaño exacto
    imgHeightMm,
    closeDelayMs = 300,
  } = opts || {};

  const pos = (() => {
    // Usaremos CSS absolute + translate según el ancla
    switch (anchor) {
      case "top-left":
        return `top:${offsetYmm}mm; left:${offsetXmm}mm; transform: translate(0,0);`;
      case "top-right":
        return `top:${offsetYmm}mm; right:${offsetXmm}mm; transform: translate(0,0);`;
      case "bottom-left":
        return `bottom:${offsetYmm}mm; left:${offsetXmm}mm; transform: translate(0,0);`;
      case "bottom-right":
        return `bottom:${offsetYmm}mm; right:${offsetXmm}mm; transform: translate(0,0);`;
      case "center":
        return `top:50%; left:50%; transform: translate(-50%,-50%);`;
    }
  })();

  const size = (() => {
    // Si das ambos, fija exactamente el tamaño; si no, deja auto para respetar proporción
    const w = typeof imgWidthMm === "number" ? `width:${imgWidthMm}mm;` : "";
    const h = typeof imgHeightMm === "number" ? `height:${imgHeightMm}mm;` : "";
    return `${w}${h}`;
  })();

  const printWin = window.open("", "_blank");
  if (!printWin) {
    alert("El navegador bloqueó la ventana de impresión.");
    return;
  }

  printWin.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Imprimir</title>
<style>
  /* Intenta fijar tamaño de página */
  @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: ${marginMm}mm; }

  /* Página en blanco sin nada más */
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: white;
  }
  body {
    position: relative;
    /* El "lienzo" donde posicionamos la imagen */
    width: 100vw;
    height: 100vh;
  }
  img#print-me {
    position: absolute;
    ${pos}
    ${size}
    /* Por defecto no deformamos: si estableces solo width o solo height, mantiene proporción */
    object-fit: contain;
  }
  @media print {
    /* Evitar números de página, headers, etc., si el navegador lo respeta */
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <img id="print-me" src="${url}" alt="to print" />
  <script>
    const img = document.getElementById('print-me');
    function go(){
      setTimeout(() => {
        window.focus();
        window.print();
        setTimeout(() => { window.close(); }, ${closeDelayMs});
      }, 50);
    }
    if (img.complete) go();
    else img.onload = go;
  </script>
</body>
</html>
  `);
  printWin.document.close();
}

interface ResultViewProps {
  rawPhoto: string | null;
  framedPhoto: string | null;
  onDownloadRaw: () => void;
  onDownloadFramed: () => void;
  onRestart: () => void;
  fileBaseName?: string;
  finalFlag?: boolean;
  taskId?: string;
  thanksImageSrc?: string;
}

export default function ResultView({
  rawPhoto,
  framedPhoto,
  onRestart,
  fileBaseName = "foto",
  finalFlag,
  taskId,
}: ResultViewProps) {
  // Conservamos QR y subida a Storage (para generar el link del QR)
  const [qrUrlRaw, setQrUrlRaw] = useState<string>("");
  const [qrUrlFramed, setQrUrlFramed] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const localTaskId = useMemo(
    () =>
      taskId ||
      `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    [taskId]
  );

  const [hostedFramedUrl, setHostedFramedUrl] = useState<string>("");
  const [hostedRawUrl, setHostedRawUrl] = useState<string>("");

  /**
   * Sube a Storage si src es dataURL y devuelve un downloadURL.
   * (Eliminado: registro de printJobs y cualquier lógica de impresión)
   */
  async function ensureHostedUrl(
    kind: "framed" | "raw",
    src: string
  ): Promise<string> {
    if (isHttpUrl(src)) {
      return absoluteFromMaybeRelative(src);
    }

    setUploading(true);
    try {
      const storage = await getStorageOrThrow();
      const { ref, uploadBytes, getDownloadURL } = await import(
        "firebase/storage"
      );

      const base = fileBaseName || "foto";
      const filename = makeFilename(
        base,
        kind === "framed" ? "con-marco" : "sin-marco"
      );
      const path = `prints/${localTaskId}/${filename}`;

      const blob = await toBlob(src);
      const r = ref(storage, path);
      await uploadBytes(r, blob, { contentType: "image/png" });
      return await getDownloadURL(r);
    } finally {
      setUploading(false);
    }
  }

  /** Prepara QR y URLs hosteadas (sin lógica de impresión) */
  useEffect(() => {
    let cancel = false;
    const base = slugify(fileBaseName || "foto");

    (async () => {
      if (framedPhoto) {
        const hosted = await ensureHostedUrl("framed", framedPhoto);
        if (!cancel) {
          setHostedFramedUrl(hosted);
          setQrUrlFramed(
            buildSurveyUrl({
              src: hosted,
              filename: `${base}-con-marco.png`,
              kind: "framed",
              final: !!finalFlag,
              taskId: localTaskId,
            })
          );
        }
      } else {
        setQrUrlFramed("");
      }

      if (rawPhoto) {
        const hosted = await ensureHostedUrl("raw", rawPhoto);
        if (!cancel) {
          setHostedRawUrl(hosted);
          setQrUrlRaw(
            buildSurveyUrl({
              src: hosted,
              filename: `${base}-sin-marco.png`,
              kind: "raw",
              final: !!finalFlag,
              taskId: localTaskId,
            })
          );
        }
      } else {
        setQrUrlRaw("");
      }
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framedPhoto, rawPhoto, fileBaseName, finalFlag, localTaskId]);

  const canShowFramed = !!framedPhoto;
  const canShowRaw = !!rawPhoto;

  return (
    <div className="w-full flex flex-col items-center gap-6 px-4">
      <h1 className="text-center font-azo text-3xl md:text-5xl font-extrabold tracking-wide text-[#f3d7b2] drop-shadow">
        Elige tu photo oportunidad
      </h1>

      <div className="w-full max-w-6xl flex flex-col gap-8">
        {/* ===== OPCIÓN 1: CON MARCO ===== */}
        {canShowFramed && (
          <section className="w-full">
            <p className="text-center text-xs md:text-sm font-bold tracking-widest text-[#f3d7b2] mb-3">
              OPCIÓN 1. IMAGEN TRADICIONAL
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-9">
                <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden flex items-center justify-center h-[42vh] md:h-[50vh]">
                  <img
                    src={framedPhoto!}
                    alt="Imagen tradicional (con marco)"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              <aside className="md:col-span-3 flex md:block items-center justify-center">
                <div className="flex flex-col items-center gap-3 md:gap-4">
                  <div className="bg-white rounded-2xl p-3 shadow-xl min-h-[164px] min-w-[164px] flex items-center justify-center">
                    {qrUrlFramed ? (
                      <QRCodeCanvas value={qrUrlFramed} size={128} />
                    ) : (
                      <span className="text-xs text-neutral-500">
                        {uploading ? "Subiendo…" : "Generando QR…"}
                      </span>
                    )}
                  </div>

                  {/* Botón de imprimir sin funcionalidad */}
                  <ButtonPrimary
                    onClick={() => {
                      if (!hostedFramedUrl) return alert("Aún subiendo…");
                        handlePrintWithLayout(hostedFramedUrl, {
                          pageWidthMm: 100,
                          pageHeightMm: 150,
                          marginMm: 0,
                          anchor: "top-left",
                          offsetXmm: 0,
                          offsetYmm: 0,
                          imgWidthMm: 100, // igual al ancho de la página
                          imgHeightMm: 150, // igual al alto de la página
                        });
                    }}
                    label="IMPRIMIR"
                  />
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* ===== OPCIÓN 2: SIN MARCO (IA) ===== */}
        {canShowRaw && (
          <section className="w-full">
            <p className="text-center text-xs md:text-sm font-bold tracking-widest text-[#f3d7b2] mb-3">
              OPCIÓN 2. IMAGEN IA
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-9">
                <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden flex items-center justify-center h-[42vh] md:h-[50vh]">
                  <img
                    src={rawPhoto!}
                    alt="Imagen IA (sin marco)"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              <aside className="md:col-span-3 flex md:block items-center justify-center">
                <div className="flex flex-col items-center gap-3 md:gap-4">
                  <div className="bg-white rounded-2xl p-3 shadow-xl min-h-[164px] min-w-[164px] flex items-center justify-center">
                    {qrUrlRaw ? (
                      <QRCodeCanvas value={qrUrlRaw} size={128} />
                    ) : (
                      <span className="text-xs text-neutral-500">
                        {uploading ? "Subiendo…" : "Generando QR…"}
                      </span>
                    )}
                  </div>

                  {/* Botón de imprimir sin funcionalidad */}
                  <ButtonPrimary
                    onClick={() => {
                      if (!hostedRawUrl) return alert("Aún subiendo…");
                        handlePrintWithLayout(hostedRawUrl, {
                          pageWidthMm: 100,
                          pageHeightMm: 150,
                          marginMm: 0,
                          anchor: "bottom-right",
                          offsetXmm: 5,
                          offsetYmm: 5,
                          imgWidthMm: 100, // igual al ancho de la página
                          imgHeightMm: 150, // igual al alto de la página
                        });
                    }}
                    label="IMPRIMIR"
                  />
                </div>
              </aside>
            </div>
          </section>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRestart}
          className="px-5 py-2 rounded-xl text-white bg-neutral-700 hover:bg-neutral-800"
        >
          Volver a tomar
        </button>
      </div>
    </div>
  );
}
