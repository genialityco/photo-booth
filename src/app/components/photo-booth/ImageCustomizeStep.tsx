/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import { getAspectClassName, type PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";
import {
  CUSTOMIZE_LOGO_HEIGHT,
  CUSTOMIZE_LOGO_MAX_WIDTH,
  scaledLogoStyle,
  scaledWideLogoStyle,
} from "@/app/components/photo-booth/logoBarSizing";

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
  buttonColorFrom,
  buttonColorTo,
  buttonClickEffect,
  logoLeftSrc,
  logoRightSrc,
  logoLeftScalePct,
  logoRightScalePct,
  aspectRatio,
  onConfirm,
  readOnly = false,
  customizationOverride = null,
  wide = false,
}: {
  previewSrc?: string | null;
  buttonImage?: string;
  buttonColorFrom?: string;
  buttonColorTo?: string;
  buttonClickEffect?: ButtonClickEffectId;
  /** Logos del evento (arriba y abajo en el resto del wizard), mostrados
   * juntos bien arriba acá para dejarle el resto del alto a la foto y las
   * configuraciones. */
  logoLeftSrc?: string;
  logoRightSrc?: string;
  /** Tamaño configurado en el admin (`logoTopScalePct`/`logoBottomScalePct`
   * del evento), en % del tamaño base. Sin valor = 100 = el de siempre. */
  logoLeftScalePct?: number;
  logoRightScalePct?: number;
  /** Relación de aspecto de la foto. "SQUARE" (default) = comportamiento original. */
  aspectRatio?: PhotoAspectRatio;
  onConfirm: (value: ImageCustomization) => void;
  /** Modo espejo (BoothMirror): paleta/textura/intensidad e imagen quedan
   * inertes, solo reflejan `customizationOverride`; el botón "¡Listo!" no se
   * muestra — la decisión es de la tablet líder. */
  readOnly?: boolean;
  customizationOverride?: ImageCustomization | null;
  /** Relaja los topes de ancho (pensados para tablet, ej.
   * clamp(340px,65vw,680px)) para aprovechar una pantalla gigante 1920x1080.
   * Off por defecto (comportamiento original en la tablet). */
  wide?: boolean;
}) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [texture, setTexture] = useState(TEXTURES[0].value);
  const [intensity, setIntensity] = useState(50);

  // Modo espejo: seguir la selección transmitida por el líder en vez de la
  // propia (acá nunca se toca nada localmente cuando readOnly).
  useEffect(() => {
    if (!customizationOverride) return;
    const idx = PALETTES.findIndex(
      (p) => p.join(",") === customizationOverride.palette.join(",")
    );
    if (idx >= 0) setPaletteIndex(idx);
    setTexture(customizationOverride.texture);
    setIntensity(customizationOverride.intensity);
  }, [customizationOverride]);

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
  // En modo `wide` (pantalla gigante) los mismos clamp() en vw quedarían
  // topeados a un ancho de tablet — se relajan los máximos para aprovechar
  // 1920px en vez de agrupar todo en el centro con barras vacías.
  const panelMaxWidth = wide ? "clamp(340px, 48vw, 1200px)" : "clamp(340px, 65vw, 680px)";
  // La miniatura preserva la proporción real de la foto (getAspectClassName,
  // ej. 3:4) - a un ancho grande eso da un rectángulo altísimo y angosto
  // ("se ve muy angosta y muy larga"). En `wide` se usa una forma más
  // horizontal (4:3, recortando con object-cover, mismo criterio que las
  // tarjetas de EventPhotoBoothLanding) y se acota por ALTO en vez de ancho,
  // para que no crezca desproporcionadamente.
  const previewAspectClass = wide ? "aspect-[4/3]" : getAspectClassName(aspectRatio);
  const previewSizeStyle: React.CSSProperties = wide
    ? { height: "clamp(220px, 34vh, 460px)", width: "auto" }
    : { width: "clamp(209px, 39.6vw, 440px)" };
  // Tamaño de los logos: base fija + el % configurado en el evento (mismo
  // criterio que el header/footer del wizard y la pantalla de carga; antes era
  // una clase de alto fija y el valor del admin no se aplicaba acá).
  const logoClassName = wide
    ? "object-fill select-none"
    : "h-auto w-auto object-contain select-none";
  const logoStyleFor = (scalePct?: number) =>
    wide
      ? scaledWideLogoStyle({ scalePct })
      : scaledLogoStyle({
          baseHeight: CUSTOMIZE_LOGO_HEIGHT,
          baseMaxWidth: CUSTOMIZE_LOGO_MAX_WIDTH,
          scalePct,
          viewportMaxWidth: "46vw",
        });
  const paletteSwatchMaxWidth = wide ? "clamp(50px, 12vw, 320px)" : "clamp(50px, 12vw, 190px)";

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
        <div
          /* Con los dos logos van uno a cada lado; con uno solo va centrado.
             Antes era `justify-between` fijo con un <span/> vacío de relleno,
             así que si faltaba uno el otro quedaba pegado a un costado. */
          className={`flex-shrink-0 w-full flex items-center gap-4 pb-1 ${
            logoLeftSrc && logoRightSrc ? "justify-between" : "justify-center"
          }`}
        >
          {logoLeftSrc ? (
            <img
              src={logoLeftSrc}
              alt=""
              className={logoClassName}
              style={logoStyleFor(logoLeftScalePct)}
              draggable={false}
            />
          ) : null}
          {logoRightSrc ? (
            <img
              src={logoRightSrc}
              alt=""
              className={logoClassName}
              style={logoStyleFor(logoRightScalePct)}
              draggable={false}
            />
          ) : null}
        </div>
      )}

      <div className="flex-1 min-h-0 w-full overflow-y-auto flex flex-col items-center justify-center gap-[2.5vh] py-2">
        {previewSrc && (
          <div
            className={`relative ${previewAspectClass} rounded-3xl overflow-hidden shadow-2xl border-4 border-white/80 flex-shrink-0`}
            style={previewSizeStyle}
          >
            <img src={previewSrc} alt="Vista previa" className={`w-full h-full ${wide ? "object-fill" : "object-cover"}`} />
          </div>
        )}

        <div className="w-full" style={{ maxWidth: panelMaxWidth }}>
          <p
            className="text-white/90 font-bold tracking-widest mb-2"
            style={{ fontSize: wide ? "clamp(1.4rem, 2.6vw, 2.1rem)" : "clamp(0.9rem, 1.8vw, 1.25rem)" }}
          >
            PALETA
          </p>
          <div className="flex gap-4">
            {PALETTES.map((colors, i) => (
              <button
                key={colors.join(",")}
                type="button"
                onClick={readOnly ? undefined : () => setPaletteIndex(i)}
                disabled={readOnly}
                aria-label={`Paleta ${colors.join(", ")}`}
                className={`flex-1 ${wide ? "aspect-[3/2]" : "aspect-square"} rounded-2xl transition-transform ${
                  paletteIndex === i ? "ring-4 ring-white scale-110" : "opacity-90 hover:opacity-100"
                }`}
                style={{
                  background: paletteStripesBackground(colors),
                  maxWidth: paletteSwatchMaxWidth,
                }}
              />
            ))}
          </div>
        </div>

        <div className="w-full" style={{ maxWidth: panelMaxWidth }}>
          <p
            className="text-white/90 font-bold tracking-widest mb-2"
            style={{ fontSize: wide ? "clamp(1.4rem, 2.6vw, 2.1rem)" : "clamp(0.9rem, 1.8vw, 1.25rem)" }}
          >
            TEXTURA
          </p>
          <div className="flex gap-3">
            {TEXTURES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={readOnly ? undefined : () => setTexture(t.value)}
                disabled={readOnly}
                className={`flex-1 rounded-full font-semibold transition-colors ${
                  texture === t.value ? "bg-black text-white" : "bg-white text-black hover:bg-white/90"
                }`}
                style={{
                  paddingTop: wide ? "clamp(1rem, 2.4vh, 2rem)" : "clamp(0.55rem, 1.3vh, 1.1rem)",
                  paddingBottom: wide ? "clamp(1rem, 2.4vh, 2rem)" : "clamp(0.55rem, 1.3vh, 1.1rem)",
                  fontSize: wide ? "clamp(1.3rem, 2.6vw, 2rem)" : "clamp(0.9rem, 1.8vw, 1.25rem)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full" style={{ maxWidth: panelMaxWidth }}>
          <p
            className="text-white/90 font-bold tracking-widest mb-2"
            style={{ fontSize: wide ? "clamp(1.4rem, 2.6vw, 2.1rem)" : "clamp(0.9rem, 1.8vw, 1.25rem)" }}
          >
            INTENSIDAD
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={intensity}
            onChange={readOnly ? undefined : (e) => setIntensity(Number(e.target.value))}
            disabled={readOnly}
            className="w-full accent-red-500"
            style={{ height: wide ? "clamp(18px, 2.4vh, 26px)" : "clamp(10px, 1.4vh, 16px)" }}
          />
        </div>
      </div>

      {!readOnly && (
        <div className="w-full flex-shrink-0 pt-2" style={{ maxWidth: panelMaxWidth }}>
          <ButtonPrimary
            onClick={handleConfirm}
            label="¡LISTO!"
            imageSrc={buttonImage}
            colorFrom={buttonColorFrom}
            colorTo={buttonColorTo}
            width="100%"
            height="clamp(52px, 8.5vh, 84px)"
            textClassName="text-lg sm:text-2xl"
            clickEffect={buttonClickEffect}
          />
        </div>
      )}
    </div>
  );
}
