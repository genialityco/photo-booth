/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Efecto "flotar en el espacio" de la imagen resultante
 * (event.resultImageEffect === "SPACE_FLOAT").
 *
 * La Cloud Function HTTP `removeBackgroundHttp` (functions/src/index.ts)
 * devuelve la misma imagen sin fondo (WebP con alfa, `cutoutUrl`). Mientras
 * no llega se muestra la original tal cual; cuando llega, la original se
 * desvanece y queda la persona recortada flotando sobre el fondo del evento.
 *
 * El recorte es SOLO para mostrar: la descarga, el QR y la impresión siguen
 * usando `url` (la original con fondo).
 */

const REMOVE_BG_URL =
  process.env.NEXT_PUBLIC_REMOVE_BG_FUNCTION_URL ||
  `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/removeBackgroundHttp`;

// Una sola llamada por tarea: el wizard la dispara (y la espera, en
// "loading") apenas la tarea queda "done", y ResultStep reusa la misma
// promesa al montarse en vez de pedir el recorte dos veces.
const cutoutRequests = new Map<string, Promise<string>>();
// Recortes ya resueltos Y precargados en el navegador, para leerlos de forma
// síncrona al montar el resultado (ver getResolvedCutout).
const resolvedCutouts = new Map<string, string>();

/** El recorte de la tarea si ya llegó y la imagen ya está en caché del
 * navegador — el resultado puede arrancar directo con él, sin mostrar antes
 * la original. */
export function getResolvedCutout(taskId: string | null | undefined): string | null {
  return (taskId && resolvedCutouts.get(taskId)) || null;
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

export function requestCutout(taskId: string): Promise<string> {
  let req = cutoutRequests.get(taskId);
  if (!req) {
    req = fetch(REMOVE_BG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.cutoutUrl) {
          throw new Error(body?.error || `removeBackgroundHttp ${res.status}`);
        }
        const cutoutUrl = body.cutoutUrl as string;
        // Precargar acá (todavía en "loading"): así el resultado lo muestra
        // al instante, sin un cuadro vacío mientras baja el WebP.
        await preloadImage(cutoutUrl);
        resolvedCutouts.set(taskId, cutoutUrl);
        return cutoutUrl;
      })
      .catch((err) => {
        // Sin cachear el fallo: un reintento (otra montada) puede andar.
        cutoutRequests.delete(taskId);
        throw err;
      });
    cutoutRequests.set(taskId, req);
  }
  return req;
}

export type TaskCutout = {
  cutoutUrl: string | null;
  /** La función falló: el padre se queda con la original. */
  failed: boolean;
};

/** Pide (o reusa) el recorte de la tarea. La pantalla espejo no lo usa: se
 * entera por el doc de imageTasks, donde la función también lo escribe. */
export function useTaskCutout(taskId: string | null | undefined, enabled: boolean): TaskCutout {
  const [state, setState] = useState<TaskCutout>(() => ({
    cutoutUrl: enabled ? getResolvedCutout(taskId) : null,
    failed: false,
  }));

  useEffect(() => {
    setState({ cutoutUrl: enabled ? getResolvedCutout(taskId) : null, failed: false });
    if (!enabled || !taskId || getResolvedCutout(taskId)) return;
    let cancelled = false;
    requestCutout(taskId).then(
      (cutoutUrl) => !cancelled && setState({ cutoutUrl, failed: false }),
      (err) => {
        console.warn("[SpaceFloatCutout] no se pudo quitar el fondo:", err);
        if (!cancelled) setState({ cutoutUrl: null, failed: true });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [taskId, enabled]);

  return state;
}

/**
 * true cuando el recorte ya cargó en el navegador Y pasó `minDelayMs` desde
 * que se montó el resultado — para no cortar la animación de entrada de la
 * original (el rearmado en partículas de PixelateImage en la tablet) y para
 * cruzar recién con la imagen lista, sin parpadeo de imagen a medio bajar.
 */
export function useCutoutShown(cutoutUrl: string | null, minDelayMs: number) {
  // Se guarda QUÉ url cargó, en vez de un booleano que se resetea con un
  // efecto al cambiar la url: con el recorte precargado (caché del
  // navegador) el `load` llega antes que ese efecto, el reset lo pisaba y el
  // recorte quedaba invisible (opacity 0) para siempre.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [delayDone, setDelayDone] = useState(minDelayMs <= 0);

  useEffect(() => {
    if (minDelayMs <= 0) return;
    const id = window.setTimeout(() => setDelayDone(true), minDelayMs);
    return () => window.clearTimeout(id);
  }, [minDelayMs]);

  const onLoad = useCallback((url: string) => setLoadedUrl(url), []);
  return { shown: !!cutoutUrl && loadedUrl === cutoutUrl && delayDone, onLoad };
}

/** La persona recortada, flotando (`.result-space-float`, globals.css). Se
 * desvanece hacia abajo porque el retrato suele cortar a la altura del pecho
 * — un borde recto flotando en el espacio se ve como una foto recortada con
 * tijera — y lleva un halo tenue, como iluminada por las estrellas. */
export default function SpaceFloatCutout({
  src,
  shown,
  onLoad,
  className = "",
}: {
  src: string;
  shown: boolean;
  onLoad: (url: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none transition-opacity duration-[1200ms] ease-out ${className}`}
      style={{ opacity: shown ? 1 : 0 }}
      aria-hidden={!shown}
    >
      <div className="absolute inset-0 result-space-float">
        <img
          src={src}
          alt="Imagen generada por IA"
          // Si la imagen ya estaba en caché puede quedar completa antes de que
          // React enganche el `onLoad` — el ref lo detecta al montar.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) onLoad(src);
          }}
          onLoad={() => onLoad(src)}
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain select-none"
          style={{
            maskImage: "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
            filter: "drop-shadow(0 0 28px rgba(170, 200, 255, 0.35))",
          }}
        />
      </div>
    </div>
  );
}
