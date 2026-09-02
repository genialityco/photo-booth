"use client";

import { useState } from "react";

/**
 * Interruptor del modo ahorro de datos, en la esquina inferior izquierda y
 * con el mismo criterio que LiveSessionStatusBadge (ícono chico y de baja
 * opacidad que expande un panel al tocarlo): es una perilla de operador, y en
 * un kiosco no puede haber controles llamativos compitiendo con el flujo del
 * asistente. Se ubica al lado del punto de estado de la sesión en vivo, no
 * encima.
 *
 * El estado real vive en la página del booth — ver lowBandwidthMode.ts para
 * qué apaga exactamente cada cosa.
 */
export default function DataSaverBadge({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-2 left-8 z-[9999]">
      {open && (
        <div className="mb-2 min-w-[240px] max-w-[280px] rounded-lg bg-black/80 backdrop-blur-sm text-white text-xs p-3 space-y-2 shadow-lg ring-1 ring-white/10">
          <p className="font-semibold text-sm">Ahorro de datos</p>
          <p className="text-white/70 leading-snug">
            Para sedes con wifi lento. Sube la foto más liviana, quita el
            revelado con rodillo y la detección de manos (que descargan varios
            MB de modelos en plena sesión) y apaga videos y animaciones.
          </p>
          <button
            type="button"
            onClick={() => onChange(!enabled)}
            className={`w-full rounded-full font-bold py-2 transition active:scale-95 ${
              enabled ? "bg-emerald-500 text-black" : "bg-white/15 text-white"
            }`}
          >
            {enabled ? "Activado · tocar para apagar" : "Desactivado · tocar para activar"}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-3.5 h-3.5 rounded-full opacity-40 hover:opacity-100 transition-opacity active:scale-90"
        aria-label="Modo ahorro de datos"
      >
        <span
          className={`block w-full h-full rounded-full ${
            enabled ? "bg-emerald-400" : "bg-white/60"
          }`}
        />
      </button>
    </div>
  );
}
