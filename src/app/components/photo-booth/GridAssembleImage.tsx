/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { FacetsLayout } from "@/app/services/photo-booth/eventService";
import { CENTER_OUT_CELL_CLASS, centerOutCellStyle } from "@/app/components/photo-booth/MultiPromptCollage";
import { centerOutTotalMs } from "@/app/components/photo-booth/multiPromptLayout";

/** Cuánto tardan las piezas en juntarse (cerrar la separación) al final. */
const JOIN_MS = 600;
/** Separación entre piezas mientras viajan, en % de cada pieza por lado. */
const FLYING_INSET = "2.5%";

export function parseGridLayout(layout?: string | null): { cols: number; rows: number } {
  const m = /^(\d)x(\d)$/.exec(layout ?? "");
  const cols = m ? Number(m[1]) : 2;
  const rows = m ? Number(m[2]) : 2;
  return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
}

type Phase = "loading" | "flying" | "joined" | "done";

/**
 * Efecto de resultado "GRID_ASSEMBLE" (event.resultImageEffect): la IA
 * devuelve UNA imagen que ya trae una cuadrícula de paneles (ej. 4 facetas en
 * 2x2). Acá se corta, solo en pantalla, en sus celdas — cada pieza es la misma
 * imagen con `background-position` — y las piezas entran una por una en orden
 * de lectura: aparecen agrandadas en el centro, se quedan un momento y viajan
 * a su lugar (animación `multiPromptCenterOut` de globals.css, la misma del
 * resultado multi-prompt). Cuando llega la última se cierra la separación y se
 * funde con `finalSrc` (la versión con marco, si hay), así que lo que queda
 * en pantalla es exactamente la imagen que baja el QR.
 *
 * Ocupa toda la caja del padre y ubica la imagen como `object-contain`, así
 * los cortes caen sobre las celdas reales de la imagen aunque la caja tenga
 * otra proporción (pantalla espejo vertical).
 */
export default function GridAssembleImage({
  src,
  finalSrc,
  layout,
  className = "",
  onAssembled,
}: {
  /** Imagen generada (sin marco): la que se corta. */
  src: string;
  /** Lo que queda al final (ej. la imagen con marco). Sin valor, `src`. */
  finalSrc?: string;
  /** "colsxrows", ej. "2x2". Sin valor, 2x2. */
  layout?: FacetsLayout | string | null;
  className?: string;
  /** Se llama una vez, cuando la imagen quedó armada. */
  onAssembled?: () => void;
}) {
  const { cols, rows } = parseGridLayout(layout);
  const count = cols * rows;

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  const onAssembledRef = useRef(onAssembled);
  onAssembledRef.current = onAssembled;

  // Medidas reales de la imagen (para ubicar los cortes) y, de paso, que ya
  // esté en caché antes de que arranque el efecto.
  useEffect(() => {
    let cancelled = false;
    setNatural(null);
    setPhase("loading");
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    };
    img.onerror = () => {
      // Sin medidas no se puede cortar: se muestra la imagen tal cual.
      if (!cancelled) setPhase("done");
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const ready = !!natural;

  // Línea de tiempo: viaje de todas las piezas -> se juntan -> listo.
  useEffect(() => {
    if (!ready || phase !== "loading") return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setPhase("done");
      return;
    }
    setPhase("flying");
  }, [ready, phase]);

  useEffect(() => {
    if (phase === "flying") {
      const id = window.setTimeout(() => setPhase("joined"), centerOutTotalMs(count));
      return () => window.clearTimeout(id);
    }
    if (phase === "joined") {
      const id = window.setTimeout(() => setPhase("done"), JOIN_MS);
      return () => window.clearTimeout(id);
    }
  }, [phase, count]);

  const doneNotified = useRef(false);
  useEffect(() => {
    doneNotified.current = false;
  }, [src]);
  useEffect(() => {
    if (phase === "done" && !doneNotified.current) {
      doneNotified.current = true;
      onAssembledRef.current?.();
    }
  }, [phase]);

  // Rectángulo que ocupa la imagen dentro de la caja, igual que object-contain
  // (centrado, lo más grande que entra con su proporción). Con unidades de
  // container query en vez de medir con JS: así coincide siempre, al píxel,
  // con la <img object-contain> final aunque la caja cambie de tamaño.
  const ratio = natural ? natural.w / natural.h : 1;
  const together = phase === "joined" || phase === "done";

  return (
    <div className={`overflow-hidden ${className}`} style={{ containerType: "size" }}>
      {natural && phase !== "loading" && (
        <div
          key={src}
          className="absolute inset-0 m-auto"
          style={{
            width: `min(100cqw, calc(100cqh * ${ratio}))`,
            height: `min(100cqh, calc(100cqw / ${ratio}))`,
          }}
          aria-hidden
        >
          {Array.from({ length: count }, (_, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const cell = { left: c / cols, top: r / rows, width: 1 / cols, height: 1 / rows };
            return (
              <div
                key={i}
                className={`absolute ${CENTER_OUT_CELL_CLASS}`}
                style={{
                  left: `${cell.left * 100}%`,
                  top: `${cell.top * 100}%`,
                  width: `${cell.width * 100}%`,
                  height: `${cell.height * 100}%`,
                  filter: together ? "none" : "drop-shadow(0 14px 22px rgba(0,0,0,0.5))",
                  transition: `filter ${JOIN_MS}ms ease-out`,
                  ...centerOutCellStyle(i, cell),
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url("${src}")`,
                    backgroundSize: `${cols * 100}% ${rows * 100}%`,
                    backgroundPosition: `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${
                      rows > 1 ? (r / (rows - 1)) * 100 : 0
                    }%`,
                    backgroundRepeat: "no-repeat",
                    clipPath: together ? "inset(0 round 0px)" : `inset(${FLYING_INSET} round 14px)`,
                    transition: `clip-path ${JOIN_MS}ms cubic-bezier(.22, 1, .36, 1)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Imagen final, encima de las piezas ya juntas. */}
      <img
        src={finalSrc || src}
        alt="Imagen generada por IA"
        className="absolute inset-0 w-full h-full object-contain select-none transition-opacity duration-500 ease-out"
        style={{ opacity: phase === "done" ? 1 : 0 }}
        draggable={false}
      />
    </div>
  );
}
