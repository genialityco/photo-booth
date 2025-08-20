// app/components/ResultView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import ButtonPrimary from "../items/ButtonPrimary";

/** Overlay de “Gracias” con portal y tamaño adaptativo */
function ThanksOverlay({ src, onClose }: { src: string; onClose: () => void }) {
    if (typeof document === "undefined") return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm grid place-items-center p-2"
            onClick={onClose}
        >
            <div className="relative" onClick={(e) => e.stopPropagation()}>
                <img
                    src={src}
                    alt="¡Gracias por haber hecho parte de esta Photo Oportunidad!"
                    className="block rounded-xl shadow-2xl max-w-[92vw] max-h-[88vh] w-auto h-auto object-contain"
                />
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 px-3 py-1 rounded-lg text-xs font-semibold bg-white/90 hover:bg-white"
                >
                    Cerrar
                </button>
            </div>
        </div>,
        document.body
    );
}

function slugify(s: string) {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function isHttpUrl(u?: string | null) {
    return !!u && (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/"));
}

function buildSurveyUrl(params: {
    src?: string;
    filename?: string;
    kind: "framed" | "raw";
    final?: boolean;
    taskId?: string;
}) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const q = new URLSearchParams();
    if (params.src) q.set("src", params.src);
    if (params.filename) q.set("filename", params.filename);
    q.set("kind", params.kind);
    if (params.final) q.set("final", "1");
    if (params.taskId) q.set("taskId", params.taskId);
    return `${origin}/survey?${q.toString()}`;
}

interface ResultViewProps {
    /** IA sin marco (dataURL o URL http). Puede ser null si no se generó. */
    rawPhoto: string | null;
    /** Foto original con marco (dataURL o URL http). Puede ser null si no existe. */
    framedPhoto: string | null;
    /** Acción local al pulsar imprimir (descarga/cola) */
    onDownloadRaw: () => void;
    onDownloadFramed: () => void;
    onRestart: () => void;
    /** Si las fotos son URLs http, puedo sugerir un nombre de archivo */
    fileBaseName?: string; // ejemplo: "mi-foto"
    finalFlag?: boolean;
    taskId?: string;

    /** Imagen del mensaje de gracias (ruta en /public) */
    thanksImageSrc?: string;
    /** Si quieres abrir el diálogo de impresión real */
    actuallyCallPrint?: boolean;
}

export default function ResultView({
    rawPhoto,
    framedPhoto,
    onDownloadRaw,
    onDownloadFramed,
    onRestart,
    fileBaseName = "foto",
    finalFlag,
    taskId,
    thanksImageSrc = "/images/Despedida.jpg",
    actuallyCallPrint = false,
}: ResultViewProps) {
    const router = useRouter();
    const [showThanks, setShowThanks] = useState(false);

    // URLs finales para los QR → /survey?...
    const [qrUrlRaw, setQrUrlRaw] = useState<string>("");
    const [qrUrlFramed, setQrUrlFramed] = useState<string>("");

    // Si vienen URLs http, armamos /survey?src=...; si son dataURL, usamos /api/qr (para no inflar QR)
    useEffect(() => {
        let cancelled = false;

        async function run() {
            const framedIsHttp = isHttpUrl(framedPhoto || undefined);
            const rawIsHttp = isHttpUrl(rawPhoto || undefined);

            if (framedIsHttp || rawIsHttp) {
                // Construcción directa con src (ideal cuando ya están hosteadas)
                const base = slugify(fileBaseName || "foto");
                if (framedIsHttp && framedPhoto) {
                    const url = buildSurveyUrl({
                        src: framedPhoto.startsWith("/") ? `${window.location.origin}${framedPhoto}` : framedPhoto,
                        filename: `${base}-con-marco.png`,
                        kind: "framed",
                        final: !!finalFlag,
                        taskId,
                    });
                    if (!cancelled) setQrUrlFramed(url)
                        console.log("url puto", qrUrlFramed);
                        ;
                }
                if (rawIsHttp && rawPhoto) {
                    const url = buildSurveyUrl({
                        src: rawPhoto.startsWith("/") ? `${window.location.origin}${rawPhoto}` : rawPhoto,
                        filename: `${base}-sin-marco.png`,
                        kind: "raw",
                        final: !!finalFlag,
                        taskId,
                    });
                    if (!cancelled) setQrUrlRaw(url);
                }
            }

            // Para cualquier imagen que sea dataURL (o si no teníamos URL), usamos QR efímero
            const needQrPost =
                (!!framedPhoto && !isHttpUrl(framedPhoto)) || (!!rawPhoto && !isHttpUrl(rawPhoto));
            if (needQrPost) {
                try {
                    const res = await fetch("/api/qr", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            rawPhoto: isHttpUrl(rawPhoto || undefined) ? undefined : rawPhoto,
                            framedPhoto: isHttpUrl(framedPhoto || undefined) ? undefined : framedPhoto,
                        }),
                    });
                    const data = await res.json();
                    if (!cancelled) {
                        if (data.framedUrl && !qrUrlFramed) setQrUrlFramed(data.framedUrl);
                        if (data.rawUrl && !qrUrlRaw) setQrUrlRaw(data.rawUrl);
                    }
                } catch (e) {
                    console.error("Error generando QR efímero:", e);
                }
            }
        }

          console.log("url puto2", qrUrlFramed);

        run();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawPhoto, framedPhoto, fileBaseName, finalFlag, taskId]);

    const goHome = () => {
        setShowThanks(false);
        router.replace("/camera");
    };

    const handlePrint = (kind: "framed" | "raw") => {
        if (kind === "framed") onDownloadFramed?.();
        else onDownloadRaw?.();

        setShowThanks(true);
        setTimeout(goHome, 10000);

        if (actuallyCallPrint) setTimeout(() => window.print(), 150);
    };

    // Cerrar con ESC + bloquear scroll en overlay
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && showThanks) goHome();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showThanks]);
    useEffect(() => {
        if (!showThanks) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [showThanks]);

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
                                            <span className="text-xs text-neutral-500">Generando QR…</span>
                                        )}
                                    </div>

                                    <ButtonPrimary onClick={() => handlePrint("framed")} label="IMPRIMIR" />
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
                                            <span className="text-xs text-neutral-500">Generando QR…</span>
                                        )}
                                    </div>

                                    <ButtonPrimary onClick={() => handlePrint("raw")} label="IMPRIMIR" />
                                </div>
                            </aside>
                        </div>
                    </section>
                )}
            </div>

            <button
                onClick={onRestart}
                className="px-5 py-2 rounded-xl text-white bg-neutral-700 hover:bg-neutral-800"
            >
                Volver a tomar
            </button>

            {showThanks && <ThanksOverlay src={thanksImageSrc} onClose={goHome} />}
        </div>
    );
}
