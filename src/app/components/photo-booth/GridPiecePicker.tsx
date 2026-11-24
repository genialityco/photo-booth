/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Paneles tocables encima de una imagen con cuadrícula ya armada
 * (GridAssembleImage): tocar un panel lo agranda desde su lugar hasta ocupar
 * toda la imagen; tocarlo otra vez vuelve a la completa. El padre decide qué
 * hace con la selección (QR/descarga de ese panel solo).
 *
 * Lo usan MultiPromptResultStep (foto dividida del multi-prompt) y ResultStep
 * (filtro con "cuadrícula desde el centro", ej. facetas por filtro).
 *
 * Ocupa toda la caja del padre (absolute inset-0) y ubica las zonas sobre el
 * mismo rectángulo que GridAssembleImage (object-contain): por eso necesita la
 * proporción real de la imagen — `imageRatio`, o la mide de `src`.
 */
export default function GridPiecePicker({
  src,
  pieces,
  cols,
  rows,
  selected,
  onSelect,
  imageRatio,
  large = false,
}: {
  /** La imagen completa en pantalla (de ella se recorta el panel al instante). */
  src: string;
  /** Un panel suelto en alta por celda, en orden de lectura. */
  pieces: string[];
  cols: number;
  rows: number;
  /** Panel agrandado; -1 = la imagen completa. */
  selected: number;
  onSelect: (index: number) => void;
  /** Ancho/alto de la imagen. Sin valor, se mide de `src`. */
  imageRatio?: number;
  /** Pantalla espejo: textos más grandes. */
  large?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    if (imageRatio) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setMeasured(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, imageRatio]);

  const ratio = imageRatio || measured;
  if (!ratio) return null;

  const piece = selected >= 0 && selected < pieces.length ? selected : -1;
  const originX = (i: number) => (cols > 1 ? ((i % cols) / (cols - 1)) * 100 : 50);
  const originY = (i: number) => (rows > 1 ? (Math.floor(i / cols) / (rows - 1)) * 100 : 50);

  return (
    <div className="absolute inset-0 z-10" style={{ containerType: "size" }}>
      <div
        className="absolute inset-0 m-auto"
        style={{
          width: `min(100cqw, calc(100cqh * ${ratio}))`,
          height: `min(100cqh, calc(100cqw / ${ratio}))`,
        }}
      >
        {Array.from({ length: cols * rows }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`Ver la foto ${i + 1} sola`}
              tabIndex={piece >= 0 ? -1 : 0}
              className="absolute active:bg-white/10 transition-colors"
              style={{
                left: `${(c / cols) * 100}%`,
                top: `${(r / rows) * 100}%`,
                width: `${100 / cols}%`,
                height: `${100 / rows}%`,
              }}
            />
          );
        })}

        {/* Panel agrandado: crece desde su lugar en la cuadrícula hasta
            ocupar toda la imagen (el origen del scale es el punto que queda
            fijo al pasar de la celda al rectángulo completo). */}
        <AnimatePresence>
          {piece >= 0 && (
            <motion.button
              key={piece}
              type="button"
              onClick={() => onSelect(-1)}
              aria-label="Volver a la imagen completa"
              className="absolute inset-0 overflow-hidden rounded-xl shadow-2xl ring-2 ring-white/70 bg-black"
              style={{ transformOrigin: `${originX(piece)}% ${originY(piece)}%` }}
              initial={reduceMotion ? { opacity: 0 } : { scaleX: 1 / cols, scaleY: 1 / rows, opacity: 0.6 }}
              animate={{ scaleX: 1, scaleY: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { scaleX: 1 / cols, scaleY: 1 / rows, opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Al instante: el panel recortado de la imagen que ya está en
                  pantalla; encima, el panel suelto en alta (puede tardar en
                  bajar con el wifi del evento). */}
              <span
                className="absolute inset-0"
                style={{
                  backgroundImage: `url("${src}")`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  backgroundPosition: `${cols > 1 ? ((piece % cols) / (cols - 1)) * 100 : 0}% ${
                    rows > 1 ? (Math.floor(piece / cols) / (rows - 1)) * 100 : 0
                  }%`,
                  backgroundRepeat: "no-repeat",
                }}
              />
              <img
                src={pieces[piece]}
                alt={`Foto ${piece + 1}`}
                className="absolute inset-0 w-full h-full object-cover select-none"
                draggable={false}
              />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Pista: sin ella nadie sabe que la cuadrícula se puede tocar. */}
      <span
        className={`pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-3 py-1 font-semibold text-white shadow ${
          large ? "text-xl" : "text-xs sm:text-sm"
        }`}
      >
        {piece >= 0 ? "Toca de nuevo para ver todas" : "Toca una foto para elegirla"}
      </span>
    </div>
  );
}
