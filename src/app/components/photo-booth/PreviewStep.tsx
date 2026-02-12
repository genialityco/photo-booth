/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";

export default function PreviewStep({
  framedShot,
  rawShot,
  boxSize = "min(88vw, 60svh)",
  onRetake,
  onConfirm,
  buttonImage,
}: {
  framedShot: string; // foto con marco (no se usa visualmente)
  rawShot?: string; // foto sin marco (para mostrar)
  boxSize?: string;
  buttonImage?: string;
  onRetake: () => void;
  onConfirm?: () => void; // confirmará y pasará al loader
}) {
  // Mostrar la foto sin marco (rawShot si está disponible, sino framedShot)
  const displayImage = rawShot || framedShot;
  {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 sm:gap-2 p-2 sm:p-3 overflow-hidden">
        <div className="flex-1 flex items-center justify-center overflow-hidden w-full">
          <div
            className="relative overflow-hidden rounded-xl shadow-lg w-full flex-shrink-0"
            style={{ width: boxSize, height: boxSize, aspectRatio: "1" }}
          >
            <img
              src={displayImage}
              alt="Preview"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
        </div>

        <div className="flex flex-row gap-1 sm:gap-2 justify-center overflow-x-auto whitespace-nowrap flex-shrink-0">
          <ButtonPrimary
            onClick={onRetake}
            imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
            label="REPETIR"
            width={120}
            height={44}
            className="min-w-[120px]"
          />
          {onConfirm && (
            <ButtonPrimary
              onClick={onConfirm}
              imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
              label="CONFIRMAR"
              width={120}
              height={44}
              className="min-w-[120px]"
            />
          )}
        </div>
      </div>
    );
  }
}
