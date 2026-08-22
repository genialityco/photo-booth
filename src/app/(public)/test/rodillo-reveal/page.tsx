/* eslint-disable @next/next/no-img-element */
"use client";

// Ruta de prueba (no forma parte del wizard real): conecta directo al
// backend Python del Kinect (kinect-roller-backend/, corriendo por fuera,
// ver su README) por WebSocket y usa el mismo motor de pintado/revelado que
// RollerRevealStep en producción, para probar con una imagen de muestra
// cómo "pinta" el rodillo real detectado por el Kinect - sin pasar por todo
// el flujo de captura/IA del photobooth.
//
// Uso: /test/rodillo-reveal?src=<url-de-imagen>&ws=<url-del-websocket>
//   src: URL o ruta pública de la imagen de muestra (default: un resultado
//        de ejemplo ya en public/).
//   ws:  URL del WebSocket del backend (default: ws://localhost:8765, el
//        puerto/host por defecto de kinect-roller-backend).

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import KinectPaintTest from "./KinectPaintTest";

const DEFAULT_SAMPLE_IMAGE = "/Colombia4.0/ALIEN.png";
const DEFAULT_WS_URL = "ws://localhost:8765";

function RodilloRevealTestInner() {
  const params = useSearchParams();
  const aiUrl = params.get("src") || DEFAULT_SAMPLE_IMAGE;
  const wsUrl = params.get("ws") || DEFAULT_WS_URL;

  const [revealed, setRevealed] = useState(false);
  // key para forzar remount de KinectPaintTest (nuevo velo limpio) al probar de nuevo
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="w-full h-screen bg-neutral-900 overflow-hidden">
      {!revealed ? (
        <KinectPaintTest key={attempt} wsUrl={wsUrl} aiUrl={aiUrl} onRevealed={() => setRevealed(true)} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-4">
          <img
            src={aiUrl}
            alt="Resultado revelado"
            className="max-w-[80vw] max-h-[70vh] object-contain rounded-2xl shadow-2xl"
          />
          <button
            type="button"
            onClick={() => {
              setRevealed(false);
              setAttempt((n) => n + 1);
            }}
            className="bg-white/90 hover:bg-white active:scale-95 transition-all rounded-full px-6 py-3 font-semibold text-neutral-900 shadow-lg"
          >
            Probar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}

export default function RodilloRevealTestPage() {
  return (
    <Suspense fallback={null}>
      <RodilloRevealTestInner />
    </Suspense>
  );
}
