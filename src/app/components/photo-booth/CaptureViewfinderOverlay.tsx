"use client";

import React from "react";

/**
 * Guía visual tipo "visor de cámara" sobre la vista de captura: grilla de
 * tercios, esquinas de encuadre, silueta de rostro y textos de instrucción.
 * Puramente decorativo (pointer-events-none) — no interfiere con el click
 * del botón de captura ni con la cámara.
 */
export default function CaptureViewfinderOverlay() {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none" aria-hidden>
      {/* Grilla de tercios */}
      <div className="absolute inset-0">
        <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/15" />
        <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/15" />
        <div className="absolute top-1/3 left-0 right-0 h-px bg-white/15" />
        <div className="absolute top-2/3 left-0 right-0 h-px bg-white/15" />
      </div>

      {/* Esquinas de encuadre */}
      <span className="absolute top-4 left-4 w-7 h-7 border-t-2 border-l-2 border-white/70 rounded-tl-md" />
      <span className="absolute top-4 right-4 w-7 h-7 border-t-2 border-r-2 border-white/70 rounded-tr-md" />
      <span className="absolute bottom-4 left-4 w-7 h-7 border-b-2 border-l-2 border-white/70 rounded-bl-md" />
      <span className="absolute bottom-4 right-4 w-7 h-7 border-b-2 border-r-2 border-white/70 rounded-br-md" />

      {/* Silueta de rostro (relleno ilustrativo) */}
      <svg
        viewBox="0 0 150 196"
        className="absolute opacity-50"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -52%)", width: 150, height: 196 }}
      >
        <ellipse cx="75" cy="86" rx="46" ry="56" fill="rgba(255,255,255,.10)" />
        <circle cx="60" cy="80" r="5" fill="rgba(255,255,255,.5)" />
        <circle cx="90" cy="80" r="5" fill="rgba(255,255,255,.5)" />
        <path d="M60 104 Q75 116 90 104" stroke="rgba(255,255,255,.5)" strokeWidth="3" fill="none" />
        <path d="M75 150 Q75 190 40 196 L110 196 Q75 190 75 150" fill="rgba(255,255,255,.08)" />
      </svg>
      {/* Silueta de rostro (contorno guía) */}
      <div
        className="absolute rounded-[50%] border-2 border-dashed border-white/40"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -52%)", width: 150, height: 196 }}
      />

      {/* Barra superior: indicador + instrucción */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white font-bold text-[13px] tracking-wide">POSA Y SONRÍE</span>
      </div>

      {/* Texto inferior */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm rounded-xl px-4 py-2 text-center">
        <div className="text-white font-semibold text-[13px]">Ubica tu rostro en el marco</div>
        <div className="text-white/70 text-[11px] mt-0.5 font-mono">mirando a la cámara</div>
      </div>
    </div>
  );
}
