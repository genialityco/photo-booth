"use client";

import { useEffect, useRef, useState } from "react";
import { db } from "@/firebaseConfig";
import {
  Timestamp,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getBoothDeviceId } from "@/app/components/photo-booth/boothDeviceId";
import type { ImageCustomization } from "@/app/components/photo-booth/ImageCustomizeStep";

const COLLECTION = "boothLiveSessions";
/** Sin heartbeat por más de esto, el líder se considera caído/cerrado.
 * Generoso a propósito: durante "reveal" (rodillo 3D con detección ONNX en
 * tiempo real) el hilo principal del líder puede quedar bastante ocupado
 * mientras alguien lo revela con calma, y no queremos que la pantalla espejo
 * lo dé por caído en pleno medio de esa animación. */
const STALE_MS = 30000;
const HEARTBEAT_MS = 5000;
/** Cada cuánto un tab espejo re-evalúa staleness aunque no llegue un snapshot nuevo. */
const STALE_CHECK_MS = 3000;

export type BoothPhase =
  | "splash"
  | "landing"
  | "capture"
  | "filter"
  | "preview"
  | "customize"
  | "loading"
  | "reveal"
  | "result";

export type BoothLiveState = {
  leaderId: string;
  updatedAt: Timestamp | null;
  phase: BoothPhase;
  taskId: string | null;
  brand: string | null;
  customization: ImageCustomization | null;
  previewUrl: string | null;
  /** Si el QR de descarga está expandido a pantalla completa en "result" —
   * la pantalla espejo lo refleja en vez de tener su propio toggle. */
  showQr: boolean;
};

type BroadcastPartial = Partial<Omit<BoothLiveState, "leaderId" | "updatedAt">>;

export type BoothLiveSessionResult =
  | { role: "pending" }
  | { role: "leader"; broadcast: (partial: BroadcastPartial) => void }
  | { role: "mirror"; state: BoothLiveState | null; isStale: boolean };

function isDocStale(updatedAt: Timestamp | null | undefined): boolean {
  return !updatedAt || Date.now() - updatedAt.toMillis() > STALE_MS;
}

const noopBroadcast: (partial: BroadcastPartial) => void = () => {};

/**
 * Determina si este tab es el "líder" interactivo (la tablet) o un "espejo"
 * pasivo de otro tab que ya está liderando el mismo evento — ver el plan de
 * sync en /booth/[slug] (BoothMirror.tsx, boothDeviceId.ts). Un solo doc por
 * evento en `boothLiveSessions/{eventId}`, reclamado por transacción: el
 * primer tab en cargar gana; una tablet que recarga (mismo deviceId
 * persistido en localStorage) retoma el liderazgo en vez de quedar como
 * espejo de sí misma; un líder que deja de mandar heartbeat por >15s se
 * considera caído y el próximo tab que cargue puede reemplazarlo. Los
 * espejos NUNCA se autopromueven a líder — solo una carga nueva de página
 * corre la transacción de reclamo.
 *
 * `enabled` (default true) es el toggle `mirrorScreenEnabled` del evento: en
 * false, esta pestaña nunca reclama/consulta `boothLiveSessions` y siempre
 * se resuelve como "leader" con un broadcast no-op — cada dispositivo queda
 * completamente independiente, sin detectar ni reflejar a otros.
 */
export function useBoothLiveSession(
  eventId: string | null | undefined,
  enabled: boolean = true
): BoothLiveSessionResult {
  const deviceIdRef = useRef<string>("");
  if (!deviceIdRef.current) deviceIdRef.current = getBoothDeviceId();

  const [result, setResult] = useState<BoothLiveSessionResult>({ role: "pending" });

  useEffect(() => {
    if (!eventId) return;

    if (!enabled) {
      setResult({ role: "leader", broadcast: noopBroadcast });
      return;
    }

    setResult({ role: "pending" });

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let staleTick: ReturnType<typeof setInterval> | undefined;

    const sessionRef = doc(db, COLLECTION, eventId);
    const deviceId = deviceIdRef.current;

    const subscribeAsMirror = () => {
      let latest: (BoothLiveState & { updatedAt?: Timestamp | null }) | null = null;

      const applyLatest = () => {
        if (!latest) {
          setResult({ role: "mirror", state: null, isStale: true });
          return;
        }
        setResult({ role: "mirror", state: latest, isStale: isDocStale(latest.updatedAt) });
      };

      unsub = onSnapshot(sessionRef, (snap) => {
        if (cancelled) return;
        latest = (snap.data() as BoothLiveState & { updatedAt?: Timestamp | null } | undefined) ?? null;
        applyLatest();
      });

      // El leader puede desaparecer sin que llegue ningún snapshot nuevo
      // (deja de escribir, no borra el doc) — re-chequeamos staleness por
      // reloj propio, no solo cuando cambia el doc.
      staleTick = setInterval(() => {
        if (!cancelled) applyLatest();
      }, STALE_CHECK_MS);
    };

    const claim = async () => {
      try {
        const becameLeader = await runTransaction(db, async (tx) => {
          const snap = await tx.get(sessionRef);
          const data = snap.data() as (Partial<BoothLiveState> & { updatedAt?: Timestamp }) | undefined;
          const sameDevice = data?.leaderId === deviceId;
          const stale = isDocStale(data?.updatedAt ?? null);

          if (!data || stale || sameDevice) {
            tx.set(sessionRef, {
              leaderId: deviceId,
              updatedAt: serverTimestamp(),
              // Una tablet que recarga retoma exactamente donde iba en vez de
              // reiniciar la coreografía de splash — cualquier otro caso
              // (doc nuevo, o líder previo caído) arranca limpio.
              phase: sameDevice ? data?.phase ?? "splash" : "splash",
              taskId: sameDevice ? data?.taskId ?? null : null,
              brand: sameDevice ? data?.brand ?? null : null,
              customization: sameDevice ? data?.customization ?? null : null,
              previewUrl: sameDevice ? data?.previewUrl ?? null : null,
              showQr: sameDevice ? data?.showQr ?? false : false,
            });
            return true;
          }
          return false;
        });

        if (cancelled) return;

        if (becameLeader) {
          const broadcast = (partial: BroadcastPartial) => {
            void updateDoc(sessionRef, {
              ...partial,
              leaderId: deviceId,
              updatedAt: serverTimestamp(),
            }).catch((e) => console.error("[useBoothLiveSession] broadcast failed:", e));
          };
          setResult({ role: "leader", broadcast });

          heartbeat = setInterval(() => {
            void updateDoc(sessionRef, { updatedAt: serverTimestamp() }).catch(() => {});
          }, HEARTBEAT_MS);
        } else {
          subscribeAsMirror();
        }
      } catch (e) {
        console.error("[useBoothLiveSession] claim failed, falling back to mirror:", e);
        if (!cancelled) subscribeAsMirror();
      }
    };

    void claim();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (heartbeat) clearInterval(heartbeat);
      if (staleTick) clearInterval(staleTick);
    };
  }, [eventId, enabled]);

  return result;
}
