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
  const BOX_QR = "clamp(140px, 25svh, 250px)"; // QR a la par

  return (
    <div className="h-[100svh] w-full flex flex-col items-center justify-between p-4 overflow-hidden">
      {/* Contenido central */}
      <div className="flex-1 w-full flex flex-col items-center justify-center">
        {/* ======= MOBILE (sin scroll, tamaños en vh) ======= */}
        <div className="w-full sm:hidden flex flex-col items-center">
          {/* Grupo 1: Foto con marco + QR */}
          <div className="flex flex-col items-center gap-2 mb-4">
            {/* Imagen: ~24vh de lado (limita también por ancho para no desbordar) */}
            <div className="relative overflow-hidden rounded-xl shadow-xl w-[min(78vw,24vh)] aspect-square">
              <img
                src={framedShotUrl}
                alt="Foto con marco"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>

            {/* QR: ~12vh de lado */}
            <div className="rounded-lg flex items-center justify-center w-[min(52vw,12vh)] aspect-square">
              <QrTag value={surveyFramed} />
            </div>
          </div>

          {/* Grupo 2: Imagen IA + QR */}
          <div className="flex flex-col items-center gap-2">
            {/* Imagen: ~24vh */}
            <div className="relative overflow-hidden rounded-xl shadow-xl w-[min(78vw,24vh)] aspect-square">
              <img
                src={aiUrl}
                alt="Imagen IA"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>

            {/* QR: ~12vh */}
            <div className="rounded-lg flex items-center justify-center w-[min(52vw,12vh)] aspect-square">
              <QrTag value={surveyAI} />
            </div>
          </div>
        </div>

        {/* ======= DESKTOP/TABLET (vista original intacta) ======= */}
        <div className="hidden sm:flex flex-col items-center justify-center gap-3">
          {/* FILA 1 original */}
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

          {/* FILA 2 original */}
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
      </div>

      {/* Botón inferior (siempre visible, sin sticky) */}
      <div className="pb-1 shrink-0">
        <ButtonPrimary onClick={onAgain} label="NUEVA FOTO" width={200} height={64} />
      </div>
    </div>
  );



}
