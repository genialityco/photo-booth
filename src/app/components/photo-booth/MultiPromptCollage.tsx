/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import { layoutGeometry, type MultiPromptLayout } from "@/app/components/photo-booth/multiPromptLayout";

/**
 * Dibuja una distribución del flujo multi-prompt con CSS, en proporciones —
 * llena a lo ancho la caja que le den (el alto sale de `aspect-ratio`), así
 * que quien la usa decide el tamaño (ver useFitRatioBox). Es la misma cuenta
 * que hace processImageTask para el collage real, así que la vista previa del
 * admin y la pantalla de resultado se ven igual que lo que baja el QR.
 *
 * `renderCell` dibuja el contenido de cada celda (foto, número de la vista
 * previa…); el orden es el de `event.prompts`.
 */
export default function MultiPromptCollage({
  layout,
  tileRatio,
  gapPct,
  bgColor,
  overlaySrc,
  count,
  renderCell,
  className = "",
  cellClassName = "",
}: {
  layout: MultiPromptLayout;
  /** Ancho/alto de una foto (relación de aspecto del evento). */
  tileRatio: number;
  gapPct: number;
  /** Fondo del lienzo; sin valor, transparente (fotos sueltas sobre el fondo del evento). */
  bgColor?: string;
  /** Marco PNG encima de todo el collage (solo vista previa del admin). */
  overlaySrc?: string;
  /** Cuántas celdas dibujar (por si llegaron menos fotos que celdas). */
  count?: number;
  renderCell: (index: number) => React.ReactNode;
  className?: string;
  cellClassName?: string;
}) {
  const geometry = useMemo(() => layoutGeometry(layout, tileRatio, gapPct), [layout, tileRatio, gapPct]);
  const cells = geometry.cells.slice(0, count ?? geometry.cells.length);

  return (
    <div
      className={`relative w-full ${className}`}
      style={{ aspectRatio: String(geometry.ratio), backgroundColor: bgColor }}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          className={`absolute overflow-hidden ${cellClassName}`}
          style={{
            left: `${c.left * 100}%`,
            top: `${c.top * 100}%`,
            width: `${c.width * 100}%`,
            height: `${c.height * 100}%`,
          }}
        >
          {renderCell(i)}
        </div>
      ))}
      {overlaySrc && (
        <img
          src={overlaySrc}
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          draggable={false}
        />
      )}
    </div>
  );
}

/** Ancho/alto del collage completo, para dimensionar su caja (useFitRatioBox). */
export function collageRatio(layout: MultiPromptLayout, tileRatio: number, gapPct: number): number {
  return layoutGeometry(layout, tileRatio, gapPct).ratio;
}
