/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import QrTag from "./QrTag";

export default function ResultStep({
  taskId,
  framedShotUrl,
  aiUrl,
  onAgain,
}: {
  taskId: string;
  framedShotUrl: string;
  aiUrl: string;
  onAgain: () => void;
}) {
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

  // Dimensiones pensadas para iPad vertical (sin scroll)
  const BOX_IMG = "clamp(220px, 38svh, 380px)"; // imagen cuadrada
  const BOX_QR  = "clamp(140px, 25svh, 250px)"; // QR a la par

  return (
    <div className="h-[100svh] w-full flex flex-col items-center justify-between p-4 overflow-hidden">
      {/* Zona central: dos filas (cada fila: imagen + QR a la par) */}
      <div className="flex-1 w-full flex flex-col items-center justify-center gap-3">
        {/* FILA 1: Foto con marco + QR */}
        <div className="flex items-center justify-center gap-3">
          <div
            className="relative overflow-hidden rounded-xl shadow-xl"
            style={{ width: BOX_IMG, height: BOX_IMG }}
          >
            <img
              src={framedShotUrl}
              alt="Foto con marco"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div
            className="rounded-lg flex items-center justify-center"
            style={{ width: BOX_QR }}
          >
            <QrTag value={surveyFramed} label="Encuesta (Foto con marco)" />
          </div>
        </div>

        {/* FILA 2: Imagen IA + QR */}
        <div className="flex items-center justify-center gap-3">
          <div
            className="relative overflow-hidden rounded-xl shadow-xl"
            style={{ width: BOX_IMG, height: BOX_IMG }}
          >
            <img
              src={aiUrl}
              alt="Imagen IA"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div
            className="rounded-lg flex items-center justify-center"
            style={{ width: BOX_QR }}
          >
            <QrTag value={surveyAI} label="Encuesta (Imagen IA)" />
          </div>
        </div>
      </div>

      {/* Botón inferior dentro del viewport */}
      <div className="pb-1 shrink-0">
        <ButtonPrimary onClick={onAgain} label="NUEVA FOTO" width={200} height={64} />
      </div>
    </div>
  );
}
