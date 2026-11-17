/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import {
  CENTER_OUT_DURATION_MS,
  CENTER_OUT_STAGGER_MS,
  layoutGeometry,
  type MultiPromptLayout,
} from "@/app/components/photo-booth/multiPromptLayout";

/** Posición y tamaño de una celda, en proporciones (0..1) del collage. */
export type CollageCellGeometry = { left: number; top: number; width: number; height: number };

/** Clase CSS del efecto "desde el centro" (globals.css); va junto con
 * `centerOutCellStyle` en cada celda. */
export const CENTER_OUT_CELL_CLASS = "multi-prompt-center-out";

/**
 * Estilo de cada celda para el efecto "desde el centro" (CENTER_OUT): la
 * animación `multiPromptCenterOut` la arranca trasladada al centro del collage
 * y agrandada (hasta ~80% del collage), y la deja en su lugar. Las variables
 * van en % del tamaño de la propia celda, que es lo que usa `translate()`.
 * Las celdas posteriores quedan encima en el DOM, así la que viaja pasa por
 * encima de las que ya llegaron.
 */
export function centerOutCellStyle(index: number, c: CollageCellGeometry): React.CSSProperties {
  const dx = ((0.5 - (c.left + c.width / 2)) / c.width) * 100;
  const dy = ((0.5 - (c.top + c.height / 2)) / c.height) * 100;
  const scale = Math.max(1, Math.min(0.8 / c.width, 0.8 / c.height));
  return {
    "--mp-dx": `${dx}%`,
    "--mp-dy": `${dy}%`,
    "--mp-s": String(scale),
    "--mp-dur": `${CENTER_OUT_DURATION_MS}ms`,
    animationDelay: `${index * CENTER_OUT_STAGGER_MS}ms`,
  } as React.CSSProperties;
}

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
  cellStyle,
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
  /** Estilo extra por celda (ej. `centerOutCellStyle` para animar la entrada). */
  cellStyle?: (index: number, cell: CollageCellGeometry) => React.CSSProperties;
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
            ...cellStyle?.(i, c),
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
