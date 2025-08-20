// app/components/ResultView.tsx
"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

interface ResultViewProps {
    rawPhoto: string;
    framedPhoto: string;
    onDownloadRaw: () => void;
    onDownloadFramed: () => void;
    onRestart: () => void;
    qrRawValue?: string;
    qrFramedValue?: string;
}

export default function ResultView({
    rawPhoto,
    framedPhoto,
    onDownloadRaw,
    onDownloadFramed,
    onRestart,
    qrRawValue = "QR - Foto sin marco",
    qrFramedValue = "QR - Foto con marco",
}: ResultViewProps) {
    const [thanksRaw, setThanksRaw] = useState(false);
    const [thanksFramed, setThanksFramed] = useState(false);

    const handlePrint = (kind: "raw" | "framed") => {
        // Si quieres abrir la impresión real: window.print();
        if (kind === "raw") {
            setThanksRaw(true);
            setTimeout(() => setThanksRaw(false), 2500);
        } else {
            setThanksFramed(true);
            setTimeout(() => setThanksFramed(false), 2500);
        }
    };

    return (
        <div className="flex flex-col items-center w-full gap-6">
            <div className="w-full max-w-6xl space-y-8">
                {/* ====== Contenedor 1: SIN MARCO ====== */}
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow">
                    <h3 className="font-semibold mb-4">Sin marco</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Columna grande: imagen */}
                        <div className="md:col-span-2">
                            <img
                                src={rawPhoto}
                                alt="Foto sin marco"
                                className="rounded-lg shadow-lg max-h-[70vh] w-full object-contain bg-black/20"
                            />
                        </div>

                        {/* Columna lateral: QR + botones */}
                        <div className="md:col-span-1 flex flex-col items-center gap-4 bg-white/5 p-6 rounded-xl border border-white/10">
                            <h4 className="font-medium">Código QR</h4>
                            <div className="bg-white rounded-xl p-4">
                                <QRCodeCanvas value={qrRawValue} size={180} />
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 w-full">
                                <button
                                    onClick={onDownloadRaw}
                                    className="flex-1 px-4 py-3 text-white bg-emerald-600 rounded-xl hover:bg-emerald-700"
                                >
                                    Descargar
                                </button>
                                <button
                                    onClick={() => handlePrint("raw")}
                                    className="flex-1 px-4 py-3 text-white bg-amber-600 rounded-xl hover:bg-amber-700"
                                >
                                    Imprimir
                                </button>
                            </div>

                            {thanksRaw && (
                                <p className="text-emerald-400 font-medium animate-pulse">
                                    ¡Gracias! Tu impresión está en proceso.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ====== Contenedor 2: CON MARCO ====== */}
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow">
                    <h3 className="font-semibold mb-4">Con marco</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Columna grande: imagen */}
                        <div className="md:col-span-2">
                            <img
                                src={framedPhoto}
                                alt="Foto con marco"
                                className="rounded-lg shadow-lg max-h-[70vh] w-full object-contain bg-black/20"
                            />
                        </div>

                        {/* Columna lateral: QR + botones */}
                        <div className="md:col-span-1 flex flex-col items-center gap-4 bg-white/5 p-6 rounded-xl border border-white/10">
                            <h4 className="font-medium">Código QR</h4>
                            <div className="bg-white rounded-xl p-4">
                                <QRCodeCanvas value={qrFramedValue} size={180} />
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 w-full">
                                <button
                                    onClick={onDownloadFramed}
                                    className="flex-1 px-4 py-3 text-white bg-emerald-600 rounded-xl hover:bg-emerald-700"
                                >
                                    Descargar
                                </button>
                                <button
                                    onClick={() => handlePrint("framed")}
                                    className="flex-1 px-4 py-3 text-white bg-amber-600 rounded-xl hover:bg-amber-700"
                                >
                                    Imprimir
                                </button>
                            </div>

                            {thanksFramed && (
                                <p className="text-emerald-400 font-medium animate-pulse">
                                    ¡Gracias! Tu impresión está en proceso.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={onRestart}
                className="px-6 py-3 text-white bg-neutral-700 rounded-xl hover:bg-neutral-800"
            >
                Volver a tomar
            </button>
        </div>
    );
}
