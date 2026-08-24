/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import type { BoothLiveState } from "@/app/components/photo-booth/useBoothLiveSession";
import type { ImageCustomization } from "@/app/components/photo-booth/ImageCustomizeStep";
import SplashScreen from "@/app/components/photo-booth/SplashScreen";
import EventPhotoBoothLanding from "@/app/components/photo-booth/EventPhotoBoothLanding";
import PreviewStep from "@/app/components/photo-booth/PreviewStep";
import ImageCustomizeStep from "@/app/components/photo-booth/ImageCustomizeStep";
import LoaderStep from "@/app/components/photo-booth/LoaderStep";
import QrTag from "@/app/components/photo-booth/QrTag";
import { useFitAspectBox } from "@/app/components/photo-booth/useFitAspectBox";
import KinectRollerRevealStep from "@/app/components/photo-booth/reveal/KinectRollerRevealStep";

const NOOP = () => {};
const NOOP_CUSTOMIZE = (_value: ImageCustomization) => {};

// Backend Python del Kinect (kinect-roller-backend/) - corre en la MISMA pc
// que esta pantalla gigante (ver README ahí: mixed-content bloquea ws:// a
// otra IP de LAN desde una página https, pero ws://localhost está exento),
// así que el default apunta a localhost. Configurable por si el backend
// corre en otro puerto/host en algún despliegue.
const KINECT_WS_URL = process.env.NEXT_PUBLIC_KINECT_WS_URL || "ws://localhost:8765";

type TaskResult = { status?: string; url?: string; videoUrl?: string };

/** Se suscribe directamente a imageTasks/{taskId} — el mismo doc que ya lee
 * el tab líder (PhotoBoothWizard.confirmAndProcess) — así el resultado final
 * llega sin duplicar esa data en boothLiveSessions. `error` se expone
 * separado de "todavía no llegó" para no quedar en una pantalla negra muda
 * si la suscripción falla (ej. permisos, doc borrado). */
function useTaskResult(taskId: string | null | undefined): {
  result: TaskResult | null;
  error: string | null;
} {
  const [result, setResult] = useState<TaskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    if (!taskId) return;
    const unsub = onSnapshot(
      doc(db, "imageTasks", taskId),
      (snap) => {
        if (!snap.exists()) {
          setError(`No se encontró la tarea ${taskId}.`);
          return;
        }
        setResult(snap.data() as TaskResult);
      },
      (err) => {
        console.error("[BoothMirror] imageTasks subscription failed:", err);
        setError(err.message);
      }
    );
    return () => unsub();
  }, [taskId]);

  return { result, error };
}

function FullBleedMessage({
  event,
  title,
  subtitle,
}: {
  event: EventProfile;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="fixed inset-0 bg-black bg-cover bg-center flex items-center justify-center"
      style={{ backgroundImage: `url('${event.bgImage || "/images/placeholder.png"}')` }}
    >
      <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-8 py-6 text-center max-w-md mx-4">
        <p className="text-white text-xl sm:text-2xl font-semibold">{title}</p>
        {subtitle && <p className="text-white/70 text-base mt-2">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Contenedor que reproduce, de forma simplificada, la caja centrada que
 * PhotoBoothWizard usa para preview/customize — sin header/footer de logos,
 * que no aportan nada esencial acá. */
function MirrorStage({ event, children }: { event: EventProfile; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `url('${event.bgImage || "/images/placeholder.png"}')` }}
        aria-hidden
      />
      <div className="w-full h-full flex items-center justify-center" style={{ maxWidth: "min(80vw, 80vh)", maxHeight: "100%" }}>
        {children}
      </div>
    </div>
  );
}

/** Espejo de ResultStep — misma caja "mat" ajustada a la relación de aspecto
 * (useFitAspectBox) y mismo QR (sello en la esquina / expandido), pero
 * dirigido por `showQr` transmitido por el líder en vez de un click propio:
 * acá es de solo lectura, refleja lo que el líder decide mostrar. */
function ResultView({
  event,
  taskId,
  showQr,
}: {
  event: EventProfile;
  taskId: string | null;
  showQr: boolean;
}) {
  const { result, error } = useTaskResult(taskId);
  const { containerRef, boxDims } = useFitAspectBox(event.photoAspectRatio);
  const [qrSize, setQrSize] = useState(400);

  // Si no hay `taskId` en absoluto (no debería pasar en "result", pero por
  // las dudas) o la suscripción tarda demasiado, mostrar algo explicable en
  // vez de una pantalla negra sin ninguna pista.
  const [tookTooLong, setTookTooLong] = useState(false);
  useEffect(() => {
    setTookTooLong(false);
    const id = window.setTimeout(() => setTookTooLong(true), 12000);
    return () => window.clearTimeout(id);
  }, [taskId]);

  useEffect(() => {
    const updateQrSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setQrSize(Math.min(Math.max(280, vw * 0.38), vh * 0.36, 480));
    };
    updateQrSize();
    window.addEventListener("resize", updateQrSize);
    return () => window.removeEventListener("resize", updateQrSize);
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const enableFrame = event.enableFrame ?? true;
  const frameSrc = event.frameImage ?? null;

  // Misma URL de /survey que arma ResultStep (aiUrl ahí = result.url acá).
  const surveyUrl = useMemo(() => {
    if (!taskId || !result?.url) return "";
    const url = new URL(`${origin}/survey`);
    if (result.videoUrl) {
      url.searchParams.set("src", result.videoUrl);
      url.searchParams.set("kind", "video");
      url.searchParams.set("filename", `video-ia-${taskId}.mp4`);
    } else {
      url.searchParams.set("src", result.url);
      url.searchParams.set("kind", "raw");
      url.searchParams.set("filename", `foto-ia-${taskId}.png`);
      if (enableFrame && frameSrc) {
        url.searchParams.set("frameUrl", frameSrc);
      }
    }
    return url.toString();
  }, [origin, taskId, result?.url, result?.videoUrl, enableFrame, frameSrc]);

  const mediaSrc = result?.videoUrl || result?.url;

  if (!taskId || error || (!mediaSrc && tookTooLong)) {
    return (
      <FullBleedMessage
        event={event}
        title="No se pudo cargar el resultado"
        subtitle={error || (!taskId ? "Falta el identificador de la tarea." : "La generación está tardando más de lo esperado.")}
      />
    );
  }

  if (!mediaSrc) return <LoaderStep />;

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
      <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
        <div
          className="relative p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 rounded-2xl shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)]"
          style={
            boxDims
              ? { width: boxDims.width, height: boxDims.height }
              : {
                  width: "min(80vw, 80vh)",
                  aspectRatio: event.photoAspectRatio === "3:4" ? "3 / 4" : "1 / 1",
                }
          }
        >
          <div className="relative w-full h-full overflow-hidden rounded-xl bg-black/5">
            {result?.videoUrl ? (
              <video
                key={result.videoUrl}
                src={result.videoUrl}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-contain"
              />
            ) : (
              <img
                key={result?.url}
                src={result?.url}
                alt="Resultado"
                className="absolute inset-0 w-full h-full object-contain"
              />
            )}

            {surveyUrl && (
              <div
                className={`absolute rounded-xl transition-all duration-300 ease-out ${
                  showQr
                    ? "inset-0 bg-white flex flex-col items-center justify-center gap-2 p-4"
                    : "bottom-2 right-2 sm:bottom-3 sm:right-3 bg-white p-1.5 sm:p-2 shadow-lg ring-1 ring-black/10"
                }`}
              >
                <QrTag
                  value={surveyUrl}
                  size={showQr ? qrSize : Math.max(48, Math.min(88, (boxDims?.width ?? 240) * 0.22))}
                  label={showQr ? "Escanea para descargar tu foto en tu celular" : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Revelado con rodillo REAL + Kinect, para revealEffect="KINECT_ROLLER" —
 * la pantalla gigante ES el Kinect, así que acá sí hay alguien tocándola de
 * verdad (a diferencia de "capture"/"preview"/etc., que reflejan lo que
 * pasa en la tablet). Espera a que la imagen generada por IA esté lista
 * antes de montar el revelado, y avisa al líder vía `reportRevealDone`
 * cuando la persona termina de descubrirla — el líder está esperando ese
 * campo para avanzar su propio paso a "result" (ver useBoothLiveSession). */
function KinectRevealView({
  event,
  taskId,
  reportRevealDone,
}: {
  event: EventProfile;
  taskId: string | null;
  reportRevealDone: (taskId: string) => void;
}) {
  const { result, error } = useTaskResult(taskId);
  const mediaSrc = result?.url;

  if (!taskId || error) {
    return (
      <FullBleedMessage
        event={event}
        title="No se pudo cargar el resultado"
        subtitle={error || "Falta el identificador de la tarea."}
      />
    );
  }

  if (!mediaSrc) return <LoaderStep />;

  return (
    <KinectRollerRevealStep
      key={taskId}
      wsUrl={KINECT_WS_URL}
      aiUrl={mediaSrc}
      aspectRatio={event.photoAspectRatio}
      showStatus={false}
      onRevealed={() => reportRevealDone(taskId)}
    />
  );
}

/**
 * Pantalla espejo, de solo lectura: se renderiza en vez de la app interactiva
 * cuando useBoothLiveSession determina que este tab NO es el líder — refleja
 * fase por fase lo que está haciendo el tab líder (otra tablet/dispositivo
 * con el mismo evento), sin cámara ni gestos de revelado (ver el plan de
 * sync: esas dos cosas son deliberadamente placeholders acá).
 */
export default function BoothMirror({
  event,
  state,
  isStale,
  reportRevealDone,
}: {
  event: EventProfile;
  state: BoothLiveState | null;
  isStale: boolean;
  reportRevealDone: (taskId: string) => void;
}) {
  if (!state || isStale) {
    return <FullBleedMessage event={event} title={event.name} subtitle="Esperando actividad…" />;
  }

  switch (state.phase) {
    case "splash":
      return <SplashScreen event={event} onStart={NOOP} />;

    case "landing":
    case "filter":
      return <EventPhotoBoothLanding event={event} readOnly selectedBrandOverride={state.brand} />;

    case "capture":
      return <FullBleedMessage event={event} title="Capturando fotografía en otro dispositivo" />;

    case "preview":
      if (!state.previewUrl) {
        return <FullBleedMessage event={event} title="Confirmando foto en otro dispositivo" />;
      }
      return (
        <MirrorStage event={event}>
          <PreviewStep
            framedShot={state.previewUrl}
            rawShot={state.previewUrl}
            onRetake={NOOP}
            readOnly
            aspectRatio={event.photoAspectRatio}
          />
        </MirrorStage>
      );

    case "customize":
      if (!state.previewUrl) {
        return <FullBleedMessage event={event} title="Confirmando foto en otro dispositivo" />;
      }
      return (
        <MirrorStage event={event}>
          <ImageCustomizeStep
            previewSrc={state.previewUrl}
            customizationOverride={state.customization}
            onConfirm={NOOP_CUSTOMIZE}
            readOnly
            logoLeftSrc={event.logoTop}
            logoRightSrc={event.logoBottom}
            aspectRatio={event.photoAspectRatio}
          />
        </MirrorStage>
      );

    case "loading":
      return <LoaderStep brandIdOverride={state.brand} />;

    case "reveal":
      // revealEffect="KINECT_ROLLER": la pantalla gigante ES el Kinect, así
      // que acá SÍ hay alguien tocándola de verdad — se revela con el
      // rodillo real y se le avisa al líder cuando termina. Para cualquier
      // otro revealEffect (mano/rodillo virtual con webcam), quien gesticula
      // está frente a la tablet, no acá, así que solo se muestra un mensaje
      // hasta que el líder reporte "result".
      if (event.revealEffect === "KINECT_ROLLER") {
        return <KinectRevealView event={event} taskId={state.taskId} reportRevealDone={reportRevealDone} />;
      }
      return <FullBleedMessage event={event} title="Revelando foto…" />;

    case "result":
      return <ResultView event={event} taskId={state.taskId} showQr={state.showQr} />;

    default:
      return <FullBleedMessage event={event} title={event.name} subtitle="Esperando actividad…" />;
  }
}
