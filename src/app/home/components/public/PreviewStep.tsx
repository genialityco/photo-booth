/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import ButtonPrimary from "@/app/items/ButtonPrimary";

export default function PreviewStep({
  framedShot,
  boxSize = "min(88vw, 60svh)",
  onRetake,
  onConfirm,
}: {
  framedShot: string; // mostramos la foto con marco
  boxSize?: string;
  onRetake: () => void;
  onConfirm?: () => void; // confirmará y pasará al loader
}) {
  return (
    <div className="h-[100svh] w-[100vw] mt-12  flex flex-col items-center justify-center gap-6">
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: boxSize, height: boxSize }}
      >
        <img
          src={framedShot}
          alt="Preview"
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>

      <div className="flex gap-3">
        <ButtonPrimary
          onClick={onRetake}
          label="REPETIR"
          width={180}
          height={60}
          imageSrc="/suRed/home/BOTON.PNG"
        />
        {onConfirm && (
          <ButtonPrimary
            onClick={onConfirm}
            label="CONFIRMAR"
            width={180}
            height={60}
            imageSrc="/suRed/home/BOTON.PNG"
          />
        )}
      </div>
    </div>
  );
}
