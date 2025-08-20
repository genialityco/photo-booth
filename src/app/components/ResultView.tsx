"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
<<<<<<< Updated upstream
import ButtonPrimary from "../items/ButtonPrimary";

=======
<<<<<<< Updated upstream
=======
import ButtonPrimary from "../items/ButtonPrimary";

/** Overlay de “Gracias” con portal y tamaño adaptativo */
>>>>>>> Stashed changes
function ThanksOverlay({
    src,
    onClose,
}: {
    src: string;
    onClose: () => void;
}) {
    if (typeof document === "undefined") return null;
<<<<<<< Updated upstream

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm grid place-items-center p-2"
            onClick={onClose} // cerrar al hacer clic fuera
=======
    return createPortal(
        <div
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm grid place-items-center p-2"
            onClick={onClose}
>>>>>>> Stashed changes
        >
            <div className="relative" onClick={(e) => e.stopPropagation()}>
                <img
                    src={src}
                    alt="¡Gracias por haber hecho parte de esta Photo Oportunidad!"
                    className="block rounded-xl shadow-2xl max-w-[92vw] max-h-[88vh] w-auto h-auto object-contain"
                />
<<<<<<< Updated upstream

=======
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 px-3 py-1 rounded-lg text-xs font-semibold bg-white/90 hover:bg-white"
                >
                    Cerrar
                </button>
>>>>>>> Stashed changes
            </div>
        </div>,
        document.body
    );
}
<<<<<<< Updated upstream
=======
>>>>>>> Stashed changes
>>>>>>> Stashed changes

interface ResultViewProps {
    rawPhoto: string;
    framedPhoto: string;
    onDownloadRaw: () => void;       // acción al imprimir opción 2 (si la usas)
    onDownloadFramed: () => void;    // acción al imprimir opción 1 (si la usas)
    onRestart: () => void;
<<<<<<< Updated upstream
    qrRawValue?: string;
    qrFramedValue?: string;
<<<<<<< Updated upstream
    thanksImageSrc?: string;
    actuallyCallPrint?: boolean;
=======
=======
    /** Imagen del mensaje de gracias (ruta en /public) */
    thanksImageSrc?: string;
    /** Si quieres abrir el diálogo de impresión real del navegador */
    actuallyCallPrint?: boolean;
>>>>>>> Stashed changes
>>>>>>> Stashed changes
}

export default function ResultView({
    rawPhoto,
    framedPhoto,
    onDownloadRaw,
    onDownloadFramed,
    onRestart,
<<<<<<< Updated upstream
    qrRawValue = "QR - Opción 2 (IA / sin marco)",
    qrFramedValue = "QR - Opción 1 (Tradicional / con marco)",
    thanksImageSrc = "/images/Despedida.jpg",
    actuallyCallPrint = false,
=======
<<<<<<< Updated upstream
    qrRawValue = "QR - Foto sin marco",
    qrFramedValue = "QR - Foto con marco",
>>>>>>> Stashed changes
}: ResultViewProps) {
    const router = useRouter();
    const [showThanks, setShowThanks] = useState(false);

    const goHome = () => {
        setShowThanks(false);
        router.replace("/camera");
    };

<<<<<<< Updated upstream
    const handlePrint = (kind: "framed" | "raw") => {
        if (kind === "framed") onDownloadFramed?.();
        else onDownloadRaw?.();

        setShowThanks(true);
        setTimeout(goHome, 10000); // redirige al terminar

        if (actuallyCallPrint) setTimeout(() => window.print(), 150);
    };

    // cerrar overlay con ESC y redirigir
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && showThanks) goHome();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showThanks]);

=======
=======
    thanksImageSrc = "/images/Despedida.jpg",
    actuallyCallPrint = false,
}: ResultViewProps) {
    const router = useRouter();

    // URLs finales que van dentro de los QR → /survey?qrId=...
    const [qrUrlRaw, setQrUrlRaw] = useState<string>("");
    const [qrUrlFramed, setQrUrlFramed] = useState<string>("");

    // Overlay “Gracias”
    const [showThanks, setShowThanks] = useState(false);

    // Genera los enlaces para ambos QR (sin usar Firebase)
    useEffect(() => {
        let cancel = false;
        (async () => {
            try {
                const res = await fetch("/api/qr", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rawPhoto, framedPhoto }),
                });
                const data = await res.json();
                if (!cancel) {
                    setQrUrlRaw(data.rawUrl || "");
                    setQrUrlFramed(data.framedUrl || "");
                }
            } catch (e) {
                console.error("Error generando QR:", e);
            }
        })();
        return () => {
            cancel = true;
        };
    }, [rawPhoto, framedPhoto]);

    // Evitar scroll del body cuando el overlay está visible
    useEffect(() => {
        if (!showThanks) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [showThanks]);

    const goHome = () => {
        setShowThanks(false);
        router.replace("/");
    };

    const handlePrint = (kind: "framed" | "raw") => {
        // Si quieres disparar una acción local cuando imprimen:
        if (kind === "framed") onDownloadFramed?.();
        else onDownloadRaw?.();

        // Mostrar overlay
        setShowThanks(true);

        // Redirigir al home al terminar
        setTimeout(goHome, 10000);

        // (Opcional) abrir print del navegador
        if (actuallyCallPrint) setTimeout(() => window.print(), 150);
    };

>>>>>>> Stashed changes
>>>>>>> Stashed changes
    return (
        <div className="w-full flex flex-col items-center gap-6 px-4">
            {/* Título */}
            <h1 className="text-center font-azo text-3xl md:text-5xl font-extrabold tracking-wide text-[#f3d7b2] drop-shadow">
                Elige tu photo oportunidad
            </h1>

            <div className="w-full max-w-6xl flex flex-col gap-8">
                {/* ========== OPCIÓN 1: IMAGEN TRADICIONAL (con marco) ========== */}
                <section className="w-full">
                    <p className="text-center text-xs md:text-sm font-bold tracking-widest text-[#f3d7b2] mb-3">
                        OPCIÓN 1. IMAGEN TRADICIONAL
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* Imagen grande */}
                        <div className="md:col-span-9">
                            <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden flex items-center justify-center h-[42vh] md:h-[50vh]">
                                <img
                                    src={framedPhoto}
                                    alt="Imagen tradicional (con marco)"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        </div>

<<<<<<< Updated upstream
                        {/* Panel lateral: QR + Imprimir */}
                        <aside className="md:col-span-3 flex md:block items-center justify-center">
                            <div className="flex flex-col items-center gap-3 md:gap-4">
                                <div className="bg-white rounded-2xl p-3 shadow-xl">
                                    <QRCodeCanvas value={qrFramedValue} size={128} />
                                </div>
=======
<<<<<<< Updated upstream
                        {/* Columna lateral: QR + botones */}
                        <div className="md:col-span-1 flex flex-col items-center gap-4 bg-white/5 p-6 rounded-xl border border-white/10">
                            <h4 className="font-medium">Código QR</h4>
                            <div className="bg-white rounded-xl p-4">
                                <QRCodeCanvas value={qrRawValue} size={180} />
=======
                        {/* Panel lateral: QR + Imprimir */}
                        <aside className="md:col-span-3 flex md:block items-center justify-center">
                            <div className="flex flex-col items-center gap-3 md:gap-4">
                                <div className="bg-white rounded-2xl p-3 shadow-xl min-h-[164px] min-w-[164px] flex items-center justify-center">
                                    {qrUrlFramed ? (
                                        <QRCodeCanvas value={qrUrlFramed} size={128} />
                                    ) : (
                                        <span className="text-xs text-neutral-500">Generando QR…</span>
                                    )}
                                </div>

                                <ButtonPrimary
                                    onClick={() => handlePrint("framed")}
                                    label="IMPRIMIR"
                                />
>>>>>>> Stashed changes
                            </div>
>>>>>>> Stashed changes

                                <ButtonPrimary onClick={() => handlePrint("framed")} label="IMPRIMIR" />
                            </div>
                        </aside>
                    </div>
                </section>

                {/* ========== OPCIÓN 2: IMAGEN IA (por ahora sin marco) ========== */}
                <section className="w-full">
                    <p className="text-center text-xs md:text-sm font-bold tracking-widest text-[#f3d7b2] mb-3">
                        OPCIÓN 2. IMAGEN IA
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* Imagen grande (usa rawPhoto) */}
                        <div className="md:col-span-9">
                            <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden flex items-center justify-center h-[42vh] md:h-[50vh]">
                                <img
                                    src={rawPhoto}
                                    alt="Imagen IA (sin marco por ahora)"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        </div>

<<<<<<< Updated upstream
                        {/* Panel lateral: QR + Imprimir */}
                        <aside className="md:col-span-3 flex md:block items-center justify-center">
                            <div className="flex flex-col items-center gap-3 md:gap-4">
                                <div className="bg-white rounded-2xl p-3 shadow-xl">
                                    <QRCodeCanvas value={qrRawValue} size={128} />
                                </div>
=======
<<<<<<< Updated upstream
                        {/* Columna lateral: QR + botones */}
                        <div className="md:col-span-1 flex flex-col items-center gap-4 bg-white/5 p-6 rounded-xl border border-white/10">
                            <h4 className="font-medium">Código QR</h4>
                            <div className="bg-white rounded-xl p-4">
                                <QRCodeCanvas value={qrFramedValue} size={180} />
=======
                        {/* Panel lateral: QR + Imprimir */}
                        <aside className="md:col-span-3 flex md:block items-center justify-center">
                            <div className="flex flex-col items-center gap-3 md:gap-4">
                                <div className="bg-white rounded-2xl p-3 shadow-xl min-h-[164px] min-w-[164px] flex items-center justify-center">
                                    {qrUrlRaw ? (
                                        <QRCodeCanvas value={qrUrlRaw} size={128} />
                                    ) : (
                                        <span className="text-xs text-neutral-500">Generando QR…</span>
                                    )}
                                </div>

                                <ButtonPrimary
                                    onClick={() => handlePrint("raw")}
                                    label="IMPRIMIR"
                                />
>>>>>>> Stashed changes
                            </div>
>>>>>>> Stashed changes

                                <ButtonPrimary onClick={() => handlePrint("raw")} label="IMPRIMIR" />
                            </div>
                        </aside>
                    </div>
                </section>
            </div>

<<<<<<< Updated upstream
            {/* Botón inferior opcional */}


            {/* Overlay “Gracias” adaptativo + redirección */}
            {showThanks && (
                <ThanksOverlay src={thanksImageSrc} onClose={goHome} />
            )}
=======
<<<<<<< Updated upstream
            <button
                onClick={onRestart}
                className="px-6 py-3 text-white bg-neutral-700 rounded-xl hover:bg-neutral-800"
            >
                Volver a tomar
            </button>
=======
            {/* Botón inferior opcional */}
            <button
                onClick={onRestart}
                className="px-5 py-2 rounded-xl text-white bg-neutral-700 hover:bg-neutral-800"
            >
                Volver a tomar
            </button>

            {/* Overlay “Gracias” con portal + redirección */}
            {showThanks && (
                <ThanksOverlay src={thanksImageSrc} onClose={goHome} />
            )}
>>>>>>> Stashed changes
>>>>>>> Stashed changes
        </div>
    );
}
