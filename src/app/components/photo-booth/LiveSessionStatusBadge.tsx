"use client";

import { useEffect, useState } from "react";
import type { Timestamp } from "firebase/firestore";
import type { BoothPhase } from "@/app/components/photo-booth/useBoothLiveSession";

const PHASE_LABELS: Partial<Record<BoothPhase, string>> = {
  splash: "Splash",
  landing: "Selección de marca",
  capture: "Capturando",
  filter: "Selección de marca",
  preview: "Vista previa",
  customize: "Personalizando",
  loading: "Generando IA",
  reveal: "Revelando",
  result: "Resultado",
};

function timeAgo(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  const secs = Math.max(0, Math.round((Date.now() - ts.toMillis()) / 1000));
  if (secs < 1) return "ahora";
  if (secs < 60) return `hace ${secs}s`;
  return `hace ${Math.round(secs / 60)}min`;
}

type Props =
  | {
      role: "leader";
      connected: boolean;
      phase: BoothPhase | null;
      brand: string | null;
      taskId: string | null;
    }
  | {
      role: "mirror";
      connected: boolean;
      isStale: boolean;
      phase: BoothPhase | null;
      brand: string | null;
      taskId: string | null;
      updatedAt: Timestamp | null;
    };

/**
 * Ícono discreto (esquina inferior izquierda, opacidad baja) que expande al
 * tocarlo un panel con rol/estado/fase — para verificar en vivo, durante un
 * evento, cuál pantalla es origen y cuál espejo, y qué se está
 * transmitiendo/recibiendo, sin exponer texto de debug al público en reposo.
 */
export default function LiveSessionStatusBadge(props: Props) {
  const [open, setOpen] = useState(false);
  const [, forceTick] = useState(0);

  // Refresca "hace Ns" mientras el panel del espejo está abierto.
  useEffect(() => {
    if (props.role !== "mirror" || !open) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open, props.role]);

  const stale = props.role === "mirror" && props.isStale;
  const dotColor = !props.connected ? "bg-amber-400" : stale ? "bg-red-500" : "bg-emerald-400";
  const statusLabel = !props.connected
    ? "Reconectando…"
    : stale
      ? "Sin señal del origen"
      : props.role === "mirror"
        ? "Recibiendo"
        : "Transmitiendo";

  return (
    <div className="fixed bottom-2 left-2 z-[9999]">
      {open && (
        <div className="mb-2 min-w-[220px] rounded-lg bg-black/80 backdrop-blur-sm text-white text-xs p-3 space-y-1 shadow-lg ring-1 ring-white/10">
          <p className="font-semibold text-sm">
            {props.role === "mirror" ? "ESPEJO" : "ORIGEN"} · {statusLabel}
          </p>
          <p>Fase: {props.phase ? (PHASE_LABELS[props.phase] ?? props.phase) : "—"}</p>
          {props.brand && <p>Marca: {props.brand}</p>}
          {props.taskId && <p>Tarea: {props.taskId.slice(0, 8)}…</p>}
          {props.role === "mirror" && <p>Actualizado: {timeAgo(props.updatedAt)}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-3.5 h-3.5 rounded-full opacity-40 hover:opacity-100 transition-opacity active:scale-90"
        aria-label="Estado de sincronización de pantalla"
      >
        <span className={`block w-full h-full rounded-full ${dotColor}`} />
      </button>
    </div>
  );
}
