/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import QrTag from "./QrTag";

type Props = {
  taskId: string;
  aiUrl: string;
  onAgain: () => void;
  footer?: React.ReactNode;
};

export default function ResultStep({
  taskId,
  aiUrl,
  onAgain,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    url.searchParams.set("src", aiUrl);
    url.searchParams.set("kind", "raw");
    url.searchParams.set("filename", `foto-ia-${taskId}.png`);
    return url.toString();
  }, [origin, aiUrl, taskId]);

  // Tamaños pensados para iPad / tótem vertical u horizontal
  const BOX_IMG = "clamp(260px, 35svh, 520px)";
  const BOX_QR = "clamp(140px, 22svh, 260px)";

  /** Maneja la descarga de la foto IA */
  const handleDownload = async () => {
    try {
      const res = await fetch(aiUrl);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `foto-ia-${taskId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error descargando la imagen:", err);
      alert("No se pudo descargar la imagen. Inténtalo nuevamente.");
    }
  };

  return (
    <div
      className="min-h-[100svh] w-full flex flex-col items-center justify-between px-6 py-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Contenido principal */}
      <main className="flex-1 w-full flex flex-col items-center justify-center mt-32">
        {/* Imagen IA */}
        <div
          className="relative overflow-hidden rounded-2xl shadow-xl bg-black/5"
          style={{ width: BOX_IMG, height: BOX_IMG }}
        >
          <img
            src={aiUrl}
            alt="Imagen generada por IA"
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* QR de encuesta */}
        <div
          className="rounded-xl flex items-center justify-center mt-3"
          style={{ width: BOX_QR, height: BOX_QR }}
        >
          <QrTag value={surveyAI} label="Encuesta (Imagen IA)" />
        </div>

        {/* Botones */}
        <div className="pt-4 flex gap-4 items-center justify-center">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            width={200}
            height={60}
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR FOTO"
            width={200}
            height={60}
          />
        </div>
      </main>
    </div>
  );
}
