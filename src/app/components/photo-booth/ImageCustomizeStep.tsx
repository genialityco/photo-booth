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
  onConfirm,
}: {
  previewSrc?: string | null;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  onConfirm: (value: ImageCustomization) => void;
}) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [texture, setTexture] = useState(TEXTURES[0].value);
  const [intensity, setIntensity] = useState(50);

  const handleConfirm = () => {
    onConfirm({ palette: PALETTES[paletteIndex], texture, intensity });
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-[3vh] px-4 overflow-y-auto py-4">
      <h2
        className="font-black text-red-500 tracking-wide drop-shadow-sm text-center"
        style={{ fontSize: "clamp(1.75rem, 5.5vw, 3.25rem)" }}
      >
        DALE TU TOQUE
      </h2>

      {previewSrc && (
        <div
          className="relative aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl border-4 border-white/80 flex-shrink-0"
          style={{ width: "clamp(180px, 34vw, 320px)" }}
        >
          <img src={previewSrc} alt="Vista previa" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="w-full" style={{ maxWidth: "clamp(320px, 60vw, 620px)" }}>
        <p
          className="text-white/90 font-bold tracking-widest mb-3"
          style={{ fontSize: "clamp(0.85rem, 1.6vw, 1.15rem)" }}
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
                maxWidth: "clamp(44px, 11vw, 180px)",
              }}
            />
          ))}
        </div>
      </div>

      <div className="w-full" style={{ maxWidth: "clamp(320px, 60vw, 620px)" }}>
        <p
          className="text-white/90 font-bold tracking-widest mb-3"
          style={{ fontSize: "clamp(0.85rem, 1.6vw, 1.15rem)" }}
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
                paddingTop: "clamp(0.6rem, 1.4vw, 1.1rem)",
                paddingBottom: "clamp(0.6rem, 1.4vw, 1.1rem)",
                fontSize: "clamp(0.85rem, 1.6vw, 1.15rem)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full" style={{ maxWidth: "clamp(320px, 60vw, 620px)" }}>
        <p
          className="text-white/90 font-bold tracking-widest mb-3"
          style={{ fontSize: "clamp(0.85rem, 1.6vw, 1.15rem)" }}
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
          style={{ height: "clamp(10px, 1.4vw, 16px)" }}
        />
      </div>

      <div className="w-full mt-2" style={{ maxWidth: "clamp(320px, 60vw, 620px)" }}>
        <ButtonPrimary
          onClick={handleConfirm}
          label="¡LISTO!"
          imageSrc={buttonImage || "/Colombia4.0/BOTON-COMENZAR.png"}
          width="100%"
          height="clamp(56px, 9vh, 88px)"
          textClassName="text-xl sm:text-2xl"
          clickEffect={buttonClickEffect}
        />
      </div>
    </div>
  );
}
