"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import ButtonPrimary from "../items/ButtonPrimary";

function ThanksOverlay({
    src,
    onClose,
}: {
    src: string;
    onClose: () => void;
}) {
    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm grid place-items-center p-2"
            onClick={onClose} // cerrar al hacer clic fuera
        >
            <div className="relative" onClick={(e) => e.stopPropagation()}>
                <img
                    src={src}
                    alt="¡Gracias por haber hecho parte de esta Photo Oportunidad!"
                    className="block rounded-xl shadow-2xl max-w-[92vw] max-h-[88vh] w-auto h-auto object-contain"
                />

            </div>
        </div>,
        document.body
    );
}

interface ResultViewProps {
    rawPhoto: string;
    framedPhoto: string;
    onDownloadRaw: () => void;
    onDownloadFramed: () => void;
    onRestart: () => void;
    qrRawValue?: string;
    qrFramedValue?: string;
    thanksImageSrc?: string;
    actuallyCallPrint?: boolean;
}

export default function ResultView({
    rawPhoto,
    framedPhoto,
    onDownloadRaw,
    onDownloadFramed,
    onRestart,
    qrRawValue = "QR - Opción 2 (IA / sin marco)",
    qrFramedValue = "QR - Opción 1 (Tradicional / con marco)",
    thanksImageSrc = "/images/Despedida.jpg",
    actuallyCallPrint = false,
}: ResultViewProps) {
    const router = useRouter();
    const [showThanks, setShowThanks] = useState(false);

    const goHome = () => {
        setShowThanks(false);
        router.replace("/camera");
    };

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

                        {/* Panel lateral: QR + Imprimir */}
                        <aside className="md:col-span-3 flex md:block items-center justify-center">
                            <div className="flex flex-col items-center gap-3 md:gap-4">
                                <div className="bg-white rounded-2xl p-3 shadow-xl">
                                    <QRCodeCanvas value={qrFramedValue} size={128} />
                                </div>

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

                        {/* Panel lateral: QR + Imprimir */}
                        <aside className="md:col-span-3 flex md:block items-center justify-center">
                            <div className="flex flex-col items-center gap-3 md:gap-4">
                                <div className="bg-white rounded-2xl p-3 shadow-xl">
                                    <QRCodeCanvas value={qrRawValue} size={128} />
                                </div>

                                <ButtonPrimary onClick={() => handlePrint("raw")} label="IMPRIMIR" />
                            </div>
                        </aside>
                    </div>
                </section>
            </div>

            {/* Botón inferior opcional */}


            {/* Overlay “Gracias” adaptativo + redirección */}
            {showThanks && (
                <ThanksOverlay src={thanksImageSrc} onClose={goHome} />
            )}
        </div>
    );
}
