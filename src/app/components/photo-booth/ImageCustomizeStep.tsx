/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";

// Cada opción es una PALETA de varios colores (no un color plano). Debe
// coincidir con TEXTURE_LABELS en functions/src/index.ts (mismos "value" de
// textura, para que el backend reconozca la elección).
const PALETTES: string[][] = [
  ["#ef4444", "#f97316", "#facc15"], // cálida
  ["#22d3ee", "#3b82f6", "#6366f1"], // fría
  ["#ec4899", "#f472b6", "#fb7185"], // rosa
  ["#4ade80", "#22c55e", "#16a34a"], // verde
  ["#a78bfa", "#8b5cf6", "#7c3aed"], // morada
];
const TEXTURES: { value: string; label: string }[] = [
  { value: "liso", label: "Liso" },
  { value: "rugoso", label: "Rugoso" },
  { value: "craquelado", label: "Craquelado" },
];

export type ImageCustomization = {
  /** Combinación de colores de la paleta elegida (varios hex, no uno solo). */
  palette: string[];
  texture: string;
  intensity: number;
};

/** Franjas diagonales con bordes duros (sin difuminar) para que cada color
 * de la paleta se vea distinto, en vez de un degradado mezclado. */
function paletteStripesBackground(colors: string[]): string {
  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`)
    .join(", ");
  return `linear-gradient(135deg, ${stops})`;
}

export default function ImageCustomizeStep({
  previewSrc,
  buttonImage,
  buttonClickEffect,
  logoLeftSrc,
  logoRightSrc,
  onConfirm,
}: {
  previewSrc?: string | null;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  /** Logos del evento (arriba y abajo en el resto del wizard), mostrados
   * juntos bien arriba acá para dejarle el resto del alto a la foto y las
   * configuraciones. */
  logoLeftSrc?: string;
  logoRightSrc?: string;
  onConfirm: (value: ImageCustomization) => void;
}) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [texture, setTexture] = useState(TEXTURES[0].value);
  const [intensity, setIntensity] = useState(50);

  const handleConfirm = () => {
    onConfirm({ palette: PALETTES[paletteIndex], texture, intensity });
  };

  // Estructura de 3 franjas: logos pegados arriba y botón pegado abajo (cada
  // uno flex-shrink-0, tamaño fijo), y en el medio un bloque flex-1 que se
  // estira para ocupar TODO el alto sobrante — ahí vive la foto + paleta +
  // textura + intensidad, centrados y con su propio scroll de emergencia
  // (min-h-0 + overflow-y-auto) solo por si una pantalla es muy baja; en la
  // gran mayoría de pantallas no llega a activarse porque el flex-1 les da
  // todo el espacio libre.
  return (
    <div
      className="w-full h-full flex flex-col items-center overflow-hidden"
      style={{
        paddingTop: "max(clamp(1rem, 3.5vh, 2.5rem), env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "0.5rem",
        paddingRight: "0.5rem",
      }}
    >
      {(logoLeftSrc || logoRightSrc) && (
        <div className="flex-shrink-0 w-full flex items-center justify-between gap-4 pb-1">
          {logoLeftSrc ? (
            <img
              src={logoLeftSrc}
              alt=""
              className="h-[clamp(3.4rem,10vh,5.5rem)] w-auto max-w-[42vw] object-contain select-none"
              draggable={false}
            />
          ) : (
            <span />
          )}
          {logoRightSrc ? (
            <img
              src={logoRightSrc}
              alt=""
              className="h-[clamp(3.4rem,10vh,5.5rem)] w-auto max-w-[42vw] object-contain select-none"
              draggable={false}
            />
          ) : (
            <span />
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 w-full overflow-y-auto flex flex-col items-center justify-center gap-[2.5vh] py-2">
        {previewSrc && (
          <div
            className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl border-4 border-white/80 flex-shrink-0"
            style={{ width: "clamp(209px, 39.6vw, 440px)" }}
          >
            <img src={previewSrc} alt="Vista previa" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="w-full" style={{ maxWidth: "clamp(340px, 65vw, 680px)" }}>
          <p
            className="text-white/90 font-bold tracking-widest mb-2"
            style={{ fontSize: "clamp(0.9rem, 1.8vw, 1.25rem)" }}
          >
            PALETA
          </p>
          <div className="flex gap-4">
            {PALETTES.map((colors, i) => (
              <button
                key={colors.join(",")}
                type="button"
                onClick={() => setPaletteIndex(i)}
                aria-label={`Paleta ${colors.join(", ")}`}
                className={`flex-1 aspect-square rounded-2xl transition-transform ${
                  paletteIndex === i ? "ring-4 ring-white scale-110" : "opacity-90 hover:opacity-100"
                }`}
                style={{
                  background: paletteStripesBackground(colors),
                  maxWidth: "clamp(50px, 12vw, 190px)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="w-full" style={{ maxWidth: "clamp(340px, 65vw, 680px)" }}>
          <p
            className="text-white/90 font-bold tracking-widest mb-2"
            style={{ fontSize: "clamp(0.9rem, 1.8vw, 1.25rem)" }}
          >
            TEXTURA
          </p>
          <div className="flex gap-3">
            {TEXTURES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTexture(t.value)}
                className={`flex-1 rounded-full font-semibold transition-colors ${
                  texture === t.value ? "bg-black text-white" : "bg-white text-black hover:bg-white/90"
                }`}
                style={{
                  paddingTop: "clamp(0.55rem, 1.3vh, 1.1rem)",
                  paddingBottom: "clamp(0.55rem, 1.3vh, 1.1rem)",
                  fontSize: "clamp(0.9rem, 1.8vw, 1.25rem)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full" style={{ maxWidth: "clamp(340px, 65vw, 680px)" }}>
          <p
            className="text-white/90 font-bold tracking-widest mb-2"
            style={{ fontSize: "clamp(0.9rem, 1.8vw, 1.25rem)" }}
          >
            INTENSIDAD
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="w-full accent-red-500"
            style={{ height: "clamp(10px, 1.4vh, 16px)" }}
          />
        </div>
      </div>

      <div className="w-full flex-shrink-0 pt-2" style={{ maxWidth: "clamp(340px, 65vw, 680px)" }}>
        <ButtonPrimary
          onClick={handleConfirm}
          label="¡LISTO!"
          imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
          width="100%"
          height="clamp(52px, 8.5vh, 84px)"
          textClassName="text-lg sm:text-2xl"
          clickEffect={buttonClickEffect}
        />
      </div>
    </div>
  );
}
