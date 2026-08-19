/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import { getAspectClassName, getAspectDims, type PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";

export default function PreviewStep({
  framedShot,
  rawShot,
  boxSize = "min(88vw, 60svh)",
  borderRadius = "xl",
  aspectRatio,
  onRetake,
  onConfirm,
  buttonImage,
  buttonClickEffect,
}: {
  framedShot: string; // foto con marco (no se usa visualmente)
  rawShot?: string; // foto sin marco (para mostrar)
  boxSize?: string;
  borderRadius?: "none" | "md" | "lg" | "xl" | "4xl";
  /** Relación de aspecto de la foto capturada. "SQUARE" (default) = comportamiento original. */
  aspectRatio?: PhotoAspectRatio;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  onRetake: () => void;
  onConfirm?: () => void; // confirmará y pasará al loader
}) {
  // Mostrar la foto sin marco (rawShot si está disponible, sino framedShot)
  const displayImage = rawShot || framedShot;

  const borderRadiusClass = {
    none: "",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    "4xl": "rounded-4xl"
  }[borderRadius];

  // La foto capturada mantiene la relación de aspecto configurada (cuadrada
  // por defecto). `w-full aspect-[...]` (sin h-full) ya cubre la mayoría de
  // pantallas: el alto queda en "auto" y se deriva del ancho vía
  // aspect-ratio. Pero cuando el contenedor es más ancho que alto (celular
  // en horizontal, donde el wizard pasa boxSize="100%" sin límite de vh),
  // ese alto derivado se recorta con max-height y el ancho no se vuelve a
  // ajustar — CSS no resuelve ese caso de forma simétrica. Medimos el
  // contenedor real y forzamos el rectángulo exacto en píxeles cuando hace
  // falta; el contenedor no depende del tamaño de esta caja, así que no hay
  // loop de resize.
  const { w: ratioW, h: ratioH } = getAspectDims(aspectRatio);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boxDims, setBoxDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      const containerRatio = width / height;
      const targetRatio = ratioW / ratioH;
      if (containerRatio > targetRatio) {
        setBoxDims({ width: height * targetRatio, height });
      } else {
        setBoxDims({ width, height: width / targetRatio });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratioW, ratioH]);

  {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 sm:gap-2 p-2 overflow-hidden">
        <div
          ref={containerRef}
          className={`flex-1 flex items-center justify-center w-full overflow-hidden ${borderRadiusClass}`}
        >
          <div
            className={`relative w-full ${getAspectClassName(aspectRatio)} max-w-full max-h-full p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)] ${borderRadiusClass}`}
            style={
              boxDims
                ? { width: boxDims.width, height: boxDims.height }
                : { maxWidth: boxSize, maxHeight: boxSize }
            }
          >
            <div className={`relative w-full h-full overflow-hidden ${borderRadiusClass}`}>
              <img
                src={displayImage}
                alt="Preview"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-row gap-1 sm:gap-2 justify-center overflow-x-auto whitespace-nowrap flex-shrink-0 w-full px-2">
          <ButtonPrimary
            onClick={onRetake}
            imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
            label="REPETIR"
            width="clamp(120px, 40vw, 310px)"
            height="clamp(40px, 8vh, 60px)"
            className="flex-1 max-w-[310px]"
            clickEffect={buttonClickEffect}
          />
          {onConfirm && (
            <ButtonPrimary
              onClick={onConfirm}
              imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
              label="CONFIRMAR"
              width="clamp(120px, 40vw, 310px)"
              height="clamp(40px, 8vh, 60px)"
              className="flex-1 max-w-[310px]"
              clickEffect={buttonClickEffect}
            />
          )}
        </div>
      </div>
    );
  }
}
