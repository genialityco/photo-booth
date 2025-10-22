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
    console.log({ url: url.toString() });
  }, [origin, aiUrl, taskId]);

  // Foto un poco más chica y QR bastante más grande
  const BOX_IMG = "clamp(200px, 44vw, 420px)"; // ancho de la foto
  const BOX_QR = "clamp(240px, 34vw, 520px)"; // lado del QR

  return (
    <div className="h-[100svh] w-full flex flex-col items-center justify-between p-4 overflow-hidden">
      <div className="flex-1 w-full flex flex-col items-center justify-center">
        {/* ======= MOBILE ======= */}
        <div className="w-full sm:hidden flex flex-col items-center">
          {/* Imagen IA (4:3) */}
          <div
            className="relative overflow-hidden rounded-2xl shadow-2xl w-[min(86vw,58vh)]"
            style={{ aspectRatio: "4 / 3" }}
          >
            <img
              src={aiUrl}
              alt="Imagen IA"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          {/* QR más grande; clic/tap abre la encuesta */}
          <a
            href={surveyAI}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 rounded-2xl flex items-center justify-center cursor-pointer select-none"
            style={{ width: BOX_QR, height: BOX_QR }}
            title="Abrir encuesta"
          >
            <QrTag value={surveyAI} />
          </a>
        </div>

        {/* ======= DESKTOP/TABLET ======= */}
        <div className="hidden sm:flex flex-col items-center justify-center">
          {/* Foto 4:3 */}
          <div
            className="relative overflow-hidden rounded-2xl shadow-2xl"
            style={{ width: BOX_IMG, aspectRatio: "4 / 3" }}
          >
            <img
              src={aiUrl}
              alt="Imagen IA"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          {/* QR centrado debajo y grande; clic/tap abre la encuesta */}
          <a
            href={surveyAI}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 rounded-2xl flex items-center justify-center cursor-pointer select-none"
            style={{ width: BOX_QR, height: BOX_QR }}
            title="Abrir encuesta"
          >
            <QrTag value={surveyAI} label="Encuesta (Imagen IA)" />
          </a>
        </div>
      </div>

      {/* Botón opcional
      <div className="pb-1 shrink-0">
        <ButtonPrimary onClick={onAgain} label="NUEVA FOTO" width={200} height={64} />
      </div>
      */}
    </div>
  );
}
