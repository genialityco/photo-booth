/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Carrusel 3D tipo "coverflow" para el resultado del modo facetas
 * (event.generationType === "FACETS"): la faceta activa al frente y las
 * vecinas giradas y hundidas a los costados. Se pasa de una a otra
 * arrastrando (dedo o mouse), tocando una vecina, con las flechas del
 * teclado o con los puntos de abajo.
 *
 * Controlado: `index` viene del padre (PhotoBoothWizard lo transmite a la
 * pantalla espejo vía useBoothLiveSession, así las dos pantallas muestran la
 * misma faceta). Con 3 o más facetas es circular: después de la última
 * vuelve la primera.
 */

const TRANSITION = "transform 560ms cubic-bezier(.22,.8,.24,1), opacity 560ms ease-out";
/** Bajo este desplazamiento (px) un pointerup cuenta como toque, no arrastre. */
const TAP_SLOP_PX = 6;
/** Un arrastre corto pero decidido (o rápido) igual pasa de faceta. */
const FLICK_MIN_PX = 30;
const FLICK_MIN_VELOCITY = 0.4; // px/ms

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

type Props = {
  items: string[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Tamaño en px de la tarjeta activa (las vecinas se calculan desde acá). */
  cardWidth: number;
  cardHeight: number;
  className?: string;
  /** Texto de ayuda bajo los puntos, oculto apenas la persona interactúa. */
  hint?: string;
};

export default function FacetCarousel3D({
  items,
  index,
  onIndexChange,
  cardWidth,
  cardHeight,
  className = "",
  hint,
}: Props) {
  const count = items.length;
  const circular = count >= 3;
  const spacing = cardWidth * 0.62;

  // Posición "virtual" sin acotar: en modo circular puede pasar de count-1 a
  // count (y no saltar hacia atrás a 0), así la animación siempre toma el
  // camino corto. La faceta real es mod(virtual, count).
  const [virtual, setVirtual] = useState(index);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const dragRef = useRef<{ x: number; t: number; pointerId: number } | null>(null);

  // Sigue al índice controlado (ej. la pantalla espejo cuando la tablet pasa
  // de faceta) por el camino más corto.
  useEffect(() => {
    setVirtual((v) => {
      const current = mod(v, count);
      if (current === index) return v;
      let delta = index - current;
      if (circular) {
        if (delta > count / 2) delta -= count;
        if (delta < -count / 2) delta += count;
      }
      return v + delta;
    });
  }, [index, count, circular]);

  const goTo = (nextVirtual: number) => {
    const clamped = circular ? nextVirtual : Math.max(0, Math.min(count - 1, nextVirtual));
    setVirtual(clamped);
    setInteracted(true);
    onIndexChange(mod(clamped, count));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (count < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragRef.current = { x: e.clientX, t: performance.now(), pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragPx(0);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    let dx = e.clientX - start.x;
    // Sin circular, resistencia elástica pasando los extremos.
    if (!circular) {
      const pos = virtual - dx / spacing;
      if (pos < 0 || pos > count - 1) dx *= 0.35;
    }
    setDragPx(dx);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    dragRef.current = null;
    const dx = e.clientX - start.x;
    const velocity = dx / Math.max(1, performance.now() - start.t);
    setDragging(false);
    setDragPx(0);

    if (Math.abs(dx) < TAP_SLOP_PX) {
      // Toque sobre una vecina => ir a esa.
      const card = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(
        "[data-facet-offset]"
      );
      const offset = card ? Math.round(Number(card.dataset.facetOffset)) : 0;
      if (offset !== 0) goTo(virtual + offset);
      return;
    }

    let delta = -Math.round(dx / spacing);
    if (delta === 0 && (Math.abs(dx) > FLICK_MIN_PX || Math.abs(velocity) > FLICK_MIN_VELOCITY)) {
      delta = dx < 0 ? 1 : -1;
    }
    if (delta !== 0) goTo(virtual + delta);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") goTo(virtual + 1);
    else if (e.key === "ArrowLeft") goTo(virtual - 1);
  };

  const pos = virtual - dragPx / spacing;
  const activeIndex = mod(virtual, count);

  return (
    <div
      // `isolate`: los z-index de las tarjetas quedan contenidos acá, sin
      // taparle al padre lo que tenga encima (QR, logos).
      className={`isolate select-none outline-none ${className}`}
      style={{ perspective: cardWidth * 3.2, touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="carrusel"
      aria-label={`Faceta ${activeIndex + 1} de ${count}`}
    >
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
        {items.map((src, i) => {
          let offset = i - pos;
          if (circular) offset = mod(offset + count / 2, count) - count / 2;
          const abs = Math.abs(offset);
          const side = Math.max(-1, Math.min(1, offset));
          const opacity = abs <= 1 ? 1 : Math.max(0, 2 - abs);
          return (
            <div
              key={i}
              data-facet-offset={offset}
              aria-hidden={i !== activeIndex}
              className="absolute left-1/2 top-1/2"
              style={{
                width: cardWidth,
                height: cardHeight,
                marginLeft: -cardWidth / 2,
                marginTop: -cardHeight / 2,
                transform: `translateX(${offset * spacing}px) translateZ(${-Math.min(abs, 2) * cardWidth * 0.45}px) rotateY(${-side * 42}deg)`,
                opacity,
                zIndex: 100 - Math.round(abs * 10),
                transition: dragging ? "none" : TRANSITION,
                pointerEvents: opacity === 0 ? "none" : undefined,
              }}
            >
              <div className="relative w-full h-full p-1.5 sm:p-2 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 shadow-[0_10px_14px_-6px_rgba(0,0,0,0.45),0_35px_60px_-15px_rgba(0,0,0,0.6)]">
                <div className="relative w-full h-full overflow-hidden rounded-xl bg-black/20">
                  <img
                    src={src}
                    alt={`Faceta ${i + 1}`}
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Las vecinas se oscurecen para que la activa resalte. */}
                  <div
                    className="absolute inset-0 bg-black pointer-events-none"
                    style={{
                      opacity: Math.min(abs, 1) * 0.45,
                      transition: dragging ? "none" : "opacity 560ms ease-out",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-1 pb-1 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ver faceta ${i + 1}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  let delta = i - activeIndex;
                  if (circular) {
                    if (delta > count / 2) delta -= count;
                    if (delta < -count / 2) delta += count;
                  }
                  goTo(virtual + delta);
                }}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? "w-7 bg-white" : "w-2.5 bg-white/45"
                }`}
              />
            ))}
          </div>
          {hint && (
            <p
              className="text-white/80 text-xs sm:text-sm font-medium drop-shadow transition-opacity duration-500"
              style={{ opacity: interacted ? 0 : 1 }}
            >
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
