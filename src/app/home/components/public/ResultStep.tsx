/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import QrTag from "./QrTag";

type Props = {
  taskId: string;
  framedShotUrl: string;
  aiUrl: string;
  onAgain: () => void;
  /** Opcional: logo superior (por defecto /logo.svg) */
  logoSrc?: string;
  logoAlt?: string;
  /** Opcional: contenido de footer (texto o nodo) */
  footer?: React.ReactNode;
};

export default function ResultStep({
  taskId,
  framedShotUrl,
  aiUrl,
  onAgain,
  logoSrc = "/logo.svg",
  logoAlt = "Logo",
  footer,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const surveyFramed = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    url.searchParams.set("src", framedShotUrl);
    url.searchParams.set("kind", "framed");
    url.searchParams.set("filename", `foto-con-marco-${taskId}.png`);
    return url.toString();
  }, [origin, framedShotUrl, taskId]);

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    url.searchParams.set("src", aiUrl);
    url.searchParams.set("kind", "raw");
    url.searchParams.set("filename", `foto-ia-${taskId}.png`);
    return url.toString();
  }, [origin, aiUrl, taskId]);

  // Tamaños pensados para iPad / tótem vertical u horizontal
  const BOX_IMG = "clamp(260px, 35svh, 520px)"; // cuadro principal (cuadrado)
  const BOX_QR = "clamp(140px, 22svh, 260px)"; // QR debajo de la imagen

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

        {/* QR de encuesta (IA) */}
        <div
          className="rounded-xl flex items-center justify-center"
          style={{ width: BOX_QR, height: BOX_QR }}
        >
          <QrTag value={surveyAI} label="Encuesta (Imagen IA)" />
        </div>

        {/* Botón principal */}
        <div className="pt-2">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            width={240}
            height={64}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full flex items-center justify-center mt-2 text-center text-xs opacity-70">
        {footer ?? (
          <span>
            Escanea el QR para descargar tu foto · {new Date().getFullYear()}
          </span>
        )}
      </footer>
    </div>
  );
}
