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
import ImageCustomizeStep from "@/app/components/photo-booth/ImageCustomizeStep";
import LoaderStep from "@/app/components/photo-booth/LoaderStep";
import QrTag from "@/app/components/photo-booth/QrTag";
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

/** Fondo full-bleed compartido por las pantallas del espejo que NO están ya
 * 100% cubiertas por una foto/canvas propio ("result"/"reveal" con Kinect no
 * lo usan - no habría nada de fondo visible detrás igual): el video del
 * salvapantallas configurado en el evento (`screenSaverVideoUrl`, la misma
 * pantalla de inactividad de la tablet) tiene prioridad; si no hay video,
 * cae a la imagen de fondo (`bgImage`) de siempre. */
function MirrorBackground({ event }: { event: EventProfile }) {
  if (event.screenSaverVideoUrl) {
    return (
      <video
        key={event.screenSaverVideoUrl}
        src={event.screenSaverVideoUrl}
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 -z-10 w-full h-full object-cover"
        aria-hidden
      />
    );
  }
  return (
    <div
      className="fixed inset-0 -z-10 bg-cover bg-center"
      style={{ backgroundImage: `url('${event.bgImage || "/images/placeholder.png"}')` }}
      aria-hidden
    />
  );
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
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <MirrorBackground event={event} />
      <div className="relative z-10 bg-black/60 backdrop-blur-sm rounded-2xl px-12 py-10 text-center max-w-4xl mx-4">
        <p className="text-white font-semibold" style={{ fontSize: "clamp(1.75rem, 4vw, 3.25rem)" }}>{title}</p>
        {subtitle && (
          <p className="text-white/70 mt-4" style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/** Logo de auspiciante (esquina superior izquierda) + texto de contacto
 * (franja inferior centrada) configurados en el evento
 * (`brandingLogoUrl`/`brandingFooterText`, ver EventForm en el admin) —
 * mismo branding que ResultStep "quema" en la foto para ver/descargar/
 * imprimir en la tablet (composeFramedImage.ts), pero acá como overlay de
 * UI sobre la pantalla gigante en vez de compuesto en el archivo, ya que
 * esta pantalla es de solo visualización, no genera ningún archivo. */
function BrandingOverlay({ event }: { event: EventProfile }) {
  const footerLines = event.brandingFooterText?.split("\n").map((l) => l.trim()).filter(Boolean) ?? [];
  return (
    <>
      {event.brandingLogoUrl && (
        <img
          src={event.brandingLogoUrl}
          alt=""
          className="absolute top-6 left-6 z-30 max-w-[32vw] max-h-[28vh] object-contain drop-shadow-lg select-none"
          draggable={false}
        />
      )}
      {footerLines.length > 0 && (
        <div className="absolute bottom-0 inset-x-0 z-30 bg-black/55 backdrop-blur-sm text-center py-5 sm:py-7 px-4">
          {footerLines.map((line, i) => (
            <p key={i} className="text-white font-semibold leading-snug" style={{ fontSize: "clamp(1.75rem, 4vw, 3.25rem)" }}>
              {line}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

/** Fondo full-bleed detrás de "customize" (el único caso que la usa - a
 * diferencia de "preview"/"result"/"reveal", que estiran la foto edge-to-edge,
 * ImageCustomizeStep es un panel de controles, no una foto, así que acá solo
 * se le da el ancho completo de la pantalla y que sus propios topes internos
 * (`wide`) decidan cuánto ocupar). */
function MirrorStage({ event, children }: { event: EventProfile; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden">
      <MirrorBackground event={event} />
      <div className="w-full h-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/** Espejo de ResultStep, pero a diferencia de esa pantalla en la tablet, acá
 * la foto se estira para llenar toda la pantalla gigante (mismo criterio que
 * /display, ver comentario en el "preview" de BoothMirror) en vez de
 * mantener su proporción real. Mismo QR (sello en la esquina / expandido),
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

  if (!mediaSrc) return <LoaderStep wide />;

  // Igual que /display (object-fill): la foto/video llena los 1920x1080 de
  // la pantalla gigante de punta a punta, sin mantener su proporción real
  // (a diferencia de ResultStep en la tablet, donde sí importa preservarla).
  return (
    <div className="fixed inset-0 bg-black">
      {result?.videoUrl ? (
        <video
          key={result.videoUrl}
          src={result.videoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-fill"
        />
      ) : (
        <img
          key={result?.url}
          src={result?.url}
          alt="Resultado"
          className="absolute inset-0 w-full h-full object-fill"
        />
      )}

      <BrandingOverlay event={event} />

      {surveyUrl && (
        <div
          className={`absolute rounded-xl transition-all duration-300 ease-out ${
            showQr
              ? "inset-0 bg-white flex flex-col items-center justify-center gap-2 p-4"
              : "bottom-4 right-4 sm:bottom-6 sm:right-6 bg-white p-1.5 sm:p-2 shadow-lg ring-1 ring-black/10"
          }`}
        >
          <QrTag
            value={surveyUrl}
            size={showQr ? qrSize : 96}
            label={showQr ? "Escanea para descargar tu foto en tu celular" : undefined}
          />
        </div>
      )}
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

  if (!mediaSrc) return <LoaderStep wide />;

  return (
    <div className="fixed inset-0">
      <KinectRollerRevealStep
        key={taskId}
        wsUrl={KINECT_WS_URL}
        aiUrl={mediaSrc}
        aspectRatio={event.photoAspectRatio}
        showStatus={false}
        fillScreen
        onRevealed={() => reportRevealDone(taskId)}
      />
      <BrandingOverlay event={event} />
    </div>
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
  // Adelanta "loading" -> "reveal" sin depender de que el líder llegue a
  // transmitir ese cambio de fase: escucha el mismo doc de imageTasks que ya
  // usa el líder para saber cuándo terminó la IA. "loading" es la espera más
  // larga de todo el flujo, así que es donde más chance hay de que un corte
  // de red puntual en el líder se pierda esa única transmisión y la pantalla
  // espejo quede trabada ahí (ver useBoothLiveSession) - esto la hace
  // independiente de esa transmisión para este paso puntual. Solo activo
  // mientras `phase==="loading"`: en "reveal"/"result" ya hay su propia
  // suscripción al mismo doc (KinectRevealView/ResultView).
  const { result: loadingTaskResult } = useTaskResult(
    state?.phase === "loading" ? state?.taskId ?? null : null
  );

  if (!state || isStale) {
    return <FullBleedMessage event={event} title={event.name} subtitle="Esperando actividad…" />;
  }

  const effectivePhase: BoothLiveState["phase"] =
    state.phase === "loading" && loadingTaskResult?.status === "done" ? "reveal" : state.phase;

  switch (effectivePhase) {
    case "splash":
      return <SplashScreen event={event} onStart={NOOP} wide bgVideoUrl={event.screenSaverVideoUrl} />;

    case "landing":
    case "filter":
      return (
        <EventPhotoBoothLanding
          event={event}
          readOnly
          selectedBrandOverride={state.brand}
          wide
          bgVideoUrl={event.screenSaverVideoUrl}
        />
      );

    case "capture":
      return <FullBleedMessage event={event} title="Capturando fotografía en otro dispositivo" />;

    case "preview":
      if (!state.previewUrl) {
        return <FullBleedMessage event={event} title="Confirmando foto en otro dispositivo" />;
      }
      // A diferencia del resto del wizard (donde la foto mantiene su forma
      // real dentro de una caja), acá se estira para llenar los 1920x1080
      // de la pantalla gigante de punta a punta - mismo criterio que
      // /display (object-fill), en vez de PreviewStep/MirrorStage (que
      // preservarían la proporción y dejarían barras negras a los costados
      // en una pantalla ancha).
      return (
        <div className="fixed inset-0 bg-black">
          <img
            key={state.previewUrl}
            src={state.previewUrl}
            alt="Vista previa"
            className="absolute inset-0 w-full h-full object-fill"
          />
        </div>
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
            wide
          />
        </MirrorStage>
      );

    case "loading":
      return <LoaderStep brandIdOverride={state.brand} wide />;

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
