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

export default function ResultStep({ taskId, aiUrl, onAgain }: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    url.searchParams.set("src", aiUrl);
    url.searchParams.set("kind", "raw");
    url.searchParams.set("filename", `foto-ia-${taskId}.png`);
    return url.toString();
  }, [origin, aiUrl, taskId]);

  const SIZE_IMG = "clamp(260px, min(70vw, 60svh), 520px)";

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
      className="min-h-[100svh] w-full flex flex-col items-center justify-start px-6"
      style={{
        paddingTop: "max(-3rem, env(safe-area-inset-top))", // 🔼 Subido visualmente
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Contenido principal */}
      <main className="flex-1 w-full flex flex-col items-center gap-5 mt-6">
        {/* Imagen IA (siempre cuadrada) */}
        <div
          className="relative overflow-hidden rounded-2xl shadow-xl bg-black/5 aspect-square"
          style={{ width: SIZE_IMG }}
        >
          <img
            src={aiUrl}
            alt="Imagen generada por IA"
            className="absolute inset-0 w-full h-full object-contain select-none"
            draggable={false}
          />
        </div>

        {/* QR de encuesta (siempre cuadrado) */}
        <div className="rounded-xl flex items-center justify-center aspect-square z-10">
          <QrTag value={surveyAI} />
        </div>

        {/* Botones */}
        <div className="pt-4 flex flex-row items-center justify-center">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            width={190}
            height={50}
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR FOTO"
            width={190}
            height={50}
          />
        </div>
      </main>
    </div>
  );
}
