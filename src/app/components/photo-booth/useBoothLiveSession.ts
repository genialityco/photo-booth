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
  /**
   * Si el salvapantallas está abierto en el líder. La pantalla espejo no
   * corre su propio reloj de inactividad — nadie la toca, así que su única
   * noción de "actividad" es lo que hace el líder — así que lo refleja desde
   * acá: tanto la activación por inactividad como la manual (mantener
   * presionado el logo, ver ScreenSaver) llegan por el mismo camino.
   */
  screenSaverActive: boolean;
  /**
   * Escrito por la pantalla ESPEJO (no el líder) cuando el revelado con
   * rodillo real + Kinect en la pantalla gigante termina —
   * revealEffect="KINECT_ROLLER" no revela nada en el tablet, así que el
   * líder mira este campo para saber cuándo avanzar a "result". Va con el
   * taskId de la foto actual (no un booleano suelto) para que un revelado
   * de una foto anterior no cuente como el de la ronda actual.
   */
  revealedTaskId: string | null;
};

type BroadcastPartial = Partial<Omit<BoothLiveState, "leaderId" | "updatedAt">>;

export type BoothLiveSessionResult =
  | { role: "pending" }
  | {
      role: "leader";
      broadcast: (partial: BroadcastPartial) => void;
      /** El `revealedTaskId` más reciente que reportó la pantalla espejo (ver
       * BoothLiveState.revealedTaskId) - null hasta que la pantalla espejo
       * escriba algo. */
      remoteRevealedTaskId: string | null;
      /** false cuando la última lectura del propio doc vino de caché local
       * (snap.metadata.fromCache) en vez del servidor — señal de que este
       * dispositivo está desconectado/reconectando, útil para el badge de
       * estado en pantalla (no solo inferirlo por ausencia de datos). */
      connected: boolean;
    }
  | {
      role: "mirror";
      state: BoothLiveState | null;
      isStale: boolean;
      /** Reporta al líder que el revelado con Kinect en esta pantalla
       * terminó para `taskId` — ver revealEffect="KINECT_ROLLER". */
      reportRevealDone: (taskId: string) => void;
      /** Ver mismo campo en el caso "leader" — acá refleja la conexión de
       * ESTA pantalla espejo, independiente de `isStale` (que refleja si el
       * LÍDER dejó de mandar heartbeat). */
      connected: boolean;
    };

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
      setResult({ role: "leader", broadcast: noopBroadcast, remoteRevealedTaskId: null, connected: true });
      return;
    }

    setResult({ role: "pending" });

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let staleTick: ReturnType<typeof setInterval> | undefined;
    let onVisible: (() => void) | undefined;

    const sessionRef = doc(db, COLLECTION, eventId);
    const deviceId = deviceIdRef.current;

    const subscribeAsMirror = () => {
      let latest: (BoothLiveState & { updatedAt?: Timestamp | null }) | null = null;
      let latestConnected = true;

      const reportRevealDone = (taskId: string) => {
        void updateDoc(sessionRef, { revealedTaskId: taskId }).catch((e) =>
          console.error("[useBoothLiveSession] reportRevealDone failed:", e)
        );
      };

      const applyLatest = () => {
        if (!latest) {
          setResult({ role: "mirror", state: null, isStale: true, reportRevealDone, connected: latestConnected });
          return;
        }
        setResult({
          role: "mirror",
          state: latest,
          isStale: isDocStale(latest.updatedAt),
          reportRevealDone,
          connected: latestConnected,
        });
      };

      unsub = onSnapshot(sessionRef, (snap) => {
        if (cancelled) return;
        latest = (snap.data() as BoothLiveState & { updatedAt?: Timestamp | null } | undefined) ?? null;
        latestConnected = !snap.metadata.fromCache;
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
              // Siempre false al reclamar: una tablet que recarga vuelve con
              // el flujo en marcha, no con el salvapantallas encima (y el
              // propio ScreenSaver lo re-transmite apenas monta).
              screenSaverActive: false,
              revealedTaskId: sameDevice ? data?.revealedTaskId ?? null : null,
            });
            return true;
          }
          return false;
        });

        if (cancelled) return;

        if (becameLeader) {
          // Guarda el último estado completo transmitido (no solo el
          // último `partial` suelto) para que el heartbeat pueda
          // reenviarlo entero - ver más abajo.
          let latestBroadcast: BroadcastPartial = {};
          const broadcast = (partial: BroadcastPartial) => {
            latestBroadcast = { ...latestBroadcast, ...partial };
            void updateDoc(sessionRef, {
              ...partial,
              leaderId: deviceId,
              updatedAt: serverTimestamp(),
            }).catch((e) => console.error("[useBoothLiveSession] broadcast failed:", e));
          };

          // También escucha el doc (no solo escribe): revealEffect="KINECT_ROLLER"
          // depende de que la pantalla espejo reporte `revealedTaskId` acá.
          // Evita un setResult (y por lo tanto un re-render de todo el
          // wizard) en cada heartbeat cuando `revealedTaskId` no cambió -
          // este listener recibe también los propios writes del líder.
          unsub = onSnapshot(sessionRef, (snap) => {
            if (cancelled) return;
            const data = snap.data() as (BoothLiveState & { updatedAt?: Timestamp | null }) | undefined;
            const nextRevealedTaskId = data?.revealedTaskId ?? null;
            const nextConnected = !snap.metadata.fromCache;
            setResult((prev) =>
              prev.role === "leader" &&
              prev.remoteRevealedTaskId === nextRevealedTaskId &&
              prev.connected === nextConnected
                ? prev
                : { role: "leader", broadcast, remoteRevealedTaskId: nextRevealedTaskId, connected: nextConnected }
            );
          });

          const flushHeartbeat = () => {
            // Reenvía el ÚLTIMO ESTADO COMPLETO, no solo el timestamp: si un
            // broadcast puntual se perdió por una red inestable (frecuente
            // en tablets de evento, y más probable durante "loading" - la
            // espera más larga de todo el flujo, mientras se genera la foto
            // con IA), esto autocorrige la pantalla espejo dentro de
            // HEARTBEAT_MS en vez de dejarla trabada en una fase vieja
            // hasta el SIGUIENTE cambio de paso (o hasta que se declare
            // stale y se desconecte del todo - el bug reportado).
            void updateDoc(sessionRef, {
              ...latestBroadcast,
              leaderId: deviceId,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          };
          heartbeat = setInterval(flushHeartbeat, HEARTBEAT_MS);

          // Los navegadores throttlean setInterval en tabs en segundo plano
          // (una tablet que se bloquea la pantalla, o donde el SO manda otra
          // app al frente un momento, durante la espera larga de "loading")
          // - el heartbeat de arriba puede así atrasarse justo lo suficiente
          // para que la pantalla espejo lo declare stale. Al recuperar
          // visibilidad, forzar un heartbeat inmediato en vez de esperar al
          // próximo tick programado.
          onVisible = () => {
            if (document.visibilityState === "visible") flushHeartbeat();
          };
          document.addEventListener("visibilitychange", onVisible);
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
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [eventId, enabled]);

  return result;
}
