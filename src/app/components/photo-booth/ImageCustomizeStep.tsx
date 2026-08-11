/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";

// Debe coincidir con TEXTURE_LABELS en functions/src/index.ts (mismos
// "value" de textura, para que el backend reconozca la elección).
const PALETTE = ["#ef4444", "#22d3ee", "#ec4899", "#4ade80", "#a78bfa"];
const TEXTURES: { value: string; label: string }[] = [
  { value: "liso", label: "Liso" },
  { value: "rugoso", label: "Rugoso" },
  { value: "craquelado", label: "Craquelado" },
];

export type ImageCustomization = {
  paletteColor: string;
  texture: string;
  intensity: number;
};

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
  const [paletteColor, setPaletteColor] = useState(PALETTE[0]);
  const [texture, setTexture] = useState(TEXTURES[0].value);
  const [intensity, setIntensity] = useState(50);

  const handleConfirm = () => {
    onConfirm({ paletteColor, texture, intensity });
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
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPaletteColor(c)}
              aria-label={`Color ${c}`}
              className={`flex-1 aspect-square rounded-2xl transition-transform ${
                paletteColor === c ? "ring-4 ring-white scale-110" : "opacity-90 hover:opacity-100"
              }`}
              style={{ backgroundColor: c, maxWidth: "clamp(44px, 9vw, 84px)" }}
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
