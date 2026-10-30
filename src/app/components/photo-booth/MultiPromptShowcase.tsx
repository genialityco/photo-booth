"use client";

import React, { useEffect, useRef } from "react";
import FacetCarousel3D from "@/app/components/photo-booth/FacetCarousel3D";
import { useFitAspectBox } from "@/app/components/photo-booth/useFitAspectBox";
import type { PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";
import { MULTI_PROMPT_SHOWCASE_SECONDS_DEFAULT } from "@/app/components/photo-booth/multiPromptLayout";

/** Tamaño de la foto activa respecto de la caja disponible (para que se
 * asomen las vecinas del carrusel). */
const CARD_SCALE = 0.78;

/**
 * Paso "showcase" del flujo multi-prompt: después de la pantalla de espera,
 * las fotos generadas (una por prompt) pasan una a una en el carrusel 3D y al
 * terminar la última se sigue solo al resultado.
 *
 * Controlado: `index` lo maneja PhotoBoothWizard y lo transmite como
 * `facetIndex` a la pantalla espejo, que monta este mismo componente sin
 * `onDone` (sin reloj propio: sigue al líder).
 */
export default function MultiPromptShowcase({
  urls,
  index,
  onIndexChange,
  aspectRatio,
  secondsPerPhoto,
  onDone,
  title = "¡Mira tus versiones!",
}: {
  urls: string[];
  index: number;
  onIndexChange: (index: number) => void;
  aspectRatio?: PhotoAspectRatio | null;
  secondsPerPhoto?: number;
  /** Sin esto no avanza solo (pantalla espejo). */
  onDone?: () => void;
  title?: string;
}) {
  const { containerRef, boxDims } = useFitAspectBox(aspectRatio);
  const count = urls.length;
  const dwellMs = Math.max(1, secondsPerPhoto ?? MULTI_PROMPT_SHOWCASE_SECONDS_DEFAULT) * 1000;

  // Cada cambio de foto (sola o deslizada a mano) reinicia el reloj; en la
  // última, el reloj lleva al resultado.
  // En refs: si el padre re-renderiza con callbacks nuevos, el reloj de la
  // foto actual no se reinicia.
  const onDoneRef = useRef(onDone);
  const onIndexChangeRef = useRef(onIndexChange);
  onDoneRef.current = onDone;
  onIndexChangeRef.current = onIndexChange;
  const autoAdvance = !!onDone;

  useEffect(() => {
    if (!autoAdvance) return;
    const id = window.setTimeout(() => {
      if (index < count - 1) onIndexChangeRef.current(index + 1);
      else onDoneRef.current?.();
    }, dwellMs);
    return () => window.clearTimeout(id);
  }, [autoAdvance, index, count, dwellMs]);

  return (
    <div className="relative w-full h-full flex flex-col items-center gap-2 sm:gap-3 py-2 sm:py-4">
      <div className="flex-shrink-0 text-center px-4">
        <p className="text-white text-2xl sm:text-3xl font-bold drop-shadow">{title}</p>
        <p className="text-white/75 text-sm sm:text-base font-medium drop-shadow">
          {Math.min(index + 1, count)} de {count}
        </p>
      </div>

      <div className="relative flex-1 min-h-0 w-full">
        {/* Solo mide: la foto activa cabe acá, el carrusel usa todo el ancho. */}
        <div
          ref={containerRef}
          className="absolute inset-x-0 top-0 bottom-8 pointer-events-none"
          aria-hidden
        />
        {boxDims && (
          <FacetCarousel3D
            items={urls}
            index={Math.min(index, count - 1)}
            onIndexChange={onIndexChange}
            cardWidth={boxDims.width * CARD_SCALE}
            cardHeight={boxDims.height * CARD_SCALE}
            className="absolute inset-0"
          />
        )}
      </div>

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="flex-shrink-0 rounded-full bg-black/45 text-white text-sm font-semibold px-5 py-2 backdrop-blur-sm active:scale-95 transition"
        >
          Ver resultado
        </button>
      )}
    </div>
  );
}
