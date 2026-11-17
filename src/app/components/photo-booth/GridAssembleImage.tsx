/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { FacetsLayout } from "@/app/services/photo-booth/eventService";
import { CENTER_OUT_CELL_CLASS, centerOutCellStyle } from "@/app/components/photo-booth/MultiPromptCollage";
import {
  CENTER_OUT_DURATION_MS,
  CENTER_OUT_STAGGER_MS,
  centerOutTotalMs,
} from "@/app/components/photo-booth/multiPromptLayout";

/** Cuánto tardan las piezas en juntarse (cerrar la separación) al final. */
const JOIN_MS = 600;
/** Separación entre piezas mientras viajan, en % de cada pieza por lado. */
const FLYING_INSET = "2.5%";

const STAR_CLIP =
  "polygon(50% 0%, 57% 43%, 100% 50%, 57% 57%, 50% 100%, 43% 57%, 0% 50%, 43% 43%)";

/** Estrella de flash (4 puntas + halo), centrada en (x%, y%) del rectángulo. */
function FlashStar({ x, y, size, delayMs }: { x: number; y: number; size: number; delayMs: number }) {
  return (
    <span
      className="absolute grid-flash-star"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}%`,
        aspectRatio: "1",
        animationDelay: `${delayMs}ms`,
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          inset: "-70%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(210,230,255,0.35) 35%, rgba(255,255,255,0) 70%)",
        }}
      />
      <span className="absolute inset-0 bg-white" style={{ clipPath: STAR_CLIP }} />
    </span>
  );
}

/**
 * Flashes de cámara del armado (todo CSS, con delays que coinciden con el
 * viaje de cada pieza porque se montan junto con ellas): un destello sobre
 * cada pieza cuando llega a su lugar, con estrellas en sus esquinas de
 * afuera, y una ráfaga sobre toda la imagen cuando queda armada.
 */
function AssembleFlashes({ cols, rows }: { cols: number; rows: number }) {
  const count = cols * rows;
  const finalMs = centerOutTotalMs(count) + JOIN_MS * 0.4;
  const starSize = 100 / Math.max(cols, rows) / 4.5;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        // Llega a su lugar al final de su animación.
        const landMs = i * CENTER_OUT_STAGGER_MS + CENTER_OUT_DURATION_MS - 60;
        const left = (c / cols) * 100;
        const top = (r / rows) * 100;
        const w = 100 / cols;
        const h = 100 / rows;
        // Esquina de afuera de la pieza (la que da al borde de la imagen).
        const cornerX = c < cols / 2 ? left : left + w;
        const cornerY = r < rows / 2 ? top : top + h;
        return (
          <React.Fragment key={i}>
            <span
              className="absolute grid-land-flash"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${w}%`,
                height: `${h}%`,
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.45) 55%, rgba(255,255,255,0) 100%)",
                animationDelay: `${landMs}ms`,
              }}
            />
            <FlashStar x={cornerX} y={cornerY} size={starSize} delayMs={landMs} />
            <FlashStar
              x={c < cols / 2 ? cornerX + w * 0.15 : cornerX - w * 0.15}
              y={(top + top + h) / 2}
              size={starSize * 0.7}
              delayMs={landMs + 140}
            />
          </React.Fragment>
        );
      })}

      {/* Ráfaga final: destello de toda la imagen + flashes alrededor. */}
      <span
        className="absolute inset-0 grid-land-flash"
        style={{ background: "rgba(255,255,255,0.9)", animationDelay: `${finalMs}ms` }}
      />
      {[
        { x: 6, y: 8 },
        { x: 94, y: 14 },
        { x: 3, y: 55 },
        { x: 97, y: 62 },
        { x: 12, y: 94 },
        { x: 86, y: 92 },
        { x: 50, y: 3 },
        { x: 50, y: 97 },
      ].map((p, i) => (
        <FlashStar key={`f${i}`} x={p.x} y={p.y} size={starSize * 1.2} delayMs={finalMs + 60 + ((i * 97) % 420)} />
      ))}
    </>
  );
}

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
  flashes = false,
}: {
  /** Flashes de cámara al llegar cada pieza y al quedar armada. */
  flashes?: boolean;
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
  const rectStyle: React.CSSProperties = {
    width: `min(100cqw, calc(100cqh * ${ratio}))`,
    height: `min(100cqh, calc(100cqw / ${ratio}))`,
  };

  return (
    <div className={`overflow-hidden ${className}`} style={{ containerType: "size" }}>
      {natural && phase !== "loading" && (
        <div key={src} className="absolute inset-0 m-auto" style={rectStyle} aria-hidden>
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

      {/* Flashes: encima de todo (también de la imagen final, para la ráfaga
          del final). Se montan junto con las piezas: los delays coinciden. */}
      {flashes && natural && phase !== "loading" && (
        <div
          key={`flash-${src}`}
          className="absolute inset-0 m-auto pointer-events-none"
          style={rectStyle}
          aria-hidden
        >
          <AssembleFlashes cols={cols} rows={rows} />
        </div>
      )}
    </div>
  );
}
