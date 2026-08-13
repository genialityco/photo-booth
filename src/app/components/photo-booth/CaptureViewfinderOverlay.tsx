"use client";

import React from "react";

/**
 * Guía visual tipo "visor de cámara" sobre la vista de captura: silueta de
 * rostro y textos de instrucción. Puramente decorativo (pointer-events-none)
 * — no interfiere con el click del botón de captura ni con la cámara. Vive
 * dentro del cuadro nítido de `FrameCamera` (que ya dibuja las esquinas de
 * encuadre como guía base siempre presente).
 */
export default function CaptureViewfinderOverlay() {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none" aria-hidden>
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
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-black/45 backdrop-blur-md rounded-full px-5 py-2.5 shadow-lg shadow-black/20">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white font-bold text-base sm:text-lg tracking-wide">POSA Y SONRÍE</span>
      </div>

      {/* Texto inferior */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/45 backdrop-blur-md rounded-2xl px-6 py-3 text-center shadow-lg shadow-black/20">
        <div className="text-white font-semibold text-base sm:text-lg">Ubica tu rostro en el marco</div>
        <div className="text-white/75 text-sm sm:text-base mt-1 font-mono">mirando a la cámara</div>
      </div>
    </div>
  );
}
