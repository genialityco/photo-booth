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
import PreviewStep from "@/app/components/photo-booth/PreviewStep";
import QrTag from "@/app/components/photo-booth/QrTag";
import RevealStep from "@/app/components/photo-booth/RevealStep";
import TopLogosBar from "@/app/components/photo-booth/TopLogosBar";
import KinectRollerRevealStep from "@/app/components/photo-booth/reveal/KinectRollerRevealStep";
import LiveSessionStatusBadge from "@/app/components/photo-booth/LiveSessionStatusBadge";
import ScreenSaver from "@/app/components/common/ScreenSaver";
import ScreenSaverEditorialGrid from "@/app/components/common/ScreenSaverEditorialGrid";

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
          // Desde que la suscripción arranca apenas se conoce `taskId` (ver
          // BoothMirror, hoisted para no perder tiempo esperando a "result"),
          // este primer snapshot puede llegar ANTES de que el líder termine
          // de escribir el doc (setTaskId/broadcast y el setDoc del doc en sí
          // no son atómicos) - no es un error real, solo "todavía no existe",
          // así que se deja `result` en null (pantallas de espera) en vez de
          // marcar error; si de verdad nunca llega, ResultView tiene su
          // propio timeout (`tookTooLong`) para avisar.
          return;
        }
        setError(null);
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
 * lo usan - no habría nada de fondo visible detrás igual): siempre la imagen
 * de fondo configurada en el evento (`bgImage`). El video de inactividad
 * (`screenSaverVideoUrl`) NO va acá — ese es contenido del salvapantallas
 * real (`<ScreenSaver mirrorActive .../>` más abajo), que ya es un overlay a
 * pantalla completa cuando está activo; usarlo también como fondo acá lo
 * dejaba tapando el fondo configurado todo el tiempo, activo o no. */
function MirrorBackground({ event }: { event: EventProfile }) {
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
  /** Estira la tarjeta del mensaje — la pantalla gigante de algunos eventos
   * (p. ej. Tito Pabón) deforma la imagen y el texto se ve "aplanado", así
   * que se contrarresta con un scale > 1. La escala mayor va en X para que
   * quede más ancho. */
  stretchX = 1.2,
  stretchY = 1.6,
}: {
  event: EventProfile;
  title: string;
  subtitle?: string;
  stretchX?: number;
  stretchY?: number;
}) {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <MirrorBackground event={event} />
      <div
        className="relative z-10 bg-black/60 backdrop-blur-sm rounded-2xl px-12 py-10 text-center max-w-4xl mx-4"
        style={
          stretchX !== 1 || stretchY !== 1
            ? { transform: `scale(${stretchX}, ${stretchY})`, transformOrigin: "center" }
            : undefined
        }
      >
        <p className="text-white font-semibold" style={{ fontSize: "clamp(1.75rem, 4vw, 3.25rem)" }}>{title}</p>
        {subtitle && (
          <p className="text-white/70 mt-4" style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/** Pantalla de inactividad del espejo: cuando no hay un líder activo (`!state`
 * o `isStale`) se muestra el "Tablero editorial" del salvapantallas en loop
 * permanente en vez del cartel de "Esperando actividad…". El propio
 * ScreenSaverEditorialGrid ya reencadena cada pasada con otras fotos, así que
 * no hace falta nada extra para que sea continuo. Si el evento todavía no
 * tiene fotos generadas (o mientras se cargan), cae al cartel de siempre. */
function MirrorIdleScreen({ event }: { event: EventProfile }) {
  const [hasPhotos, setHasPhotos] = useState(false);

  return (
    <div className="fixed inset-0 bg-black">
      <ScreenSaverEditorialGrid
        eventId={event.id}
        promptIds={event.prompts}
        active
        durationSec={event.screenSaverSlideDurationSec ?? 10}
        texts={event.screenSaverEditorialTexts}
        // Pantalla espejo vertical (1080x1920): sin ensanchar, mismas
        // tarjetas que la referencia tablet (cardWiden default = 1).
        onPhotosChange={(count) => setHasPhotos(count > 0)}
      />
      {!hasPhotos && (
        <FullBleedMessage
          event={event}
          title={event.name}
          subtitle="Esperando actividad…"
          stretchX={1.6}
          stretchY={1.2}
        />
      )}
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

/** Fondo full-bleed detrás de "preview"/"customize" — ImageCustomizeStep es
 * un panel de controles, no una foto, así que acá solo se le da el ancho
 * completo de la pantalla y que sus propios topes internos decidan cuánto
 * ocupar. */
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

/** Espejo de ResultStep — misma proporción real de la foto/video (object-
 * contain) que en la tablet, adaptada a la pantalla espejo vertical
 * (1080x1920). El QR arranca siempre como sello en la esquina y se agranda
 * SOLO al tocarlo en ESTA pantalla: quien está parado frente a la pantalla
 * gigante decide por sí mismo si quiere verlo grande, así que el `showQr`
 * que transmite el líder se ignora a propósito acá (ver estado propio
 * `localShowQr` más abajo). */
function ResultView({
  event,
  taskId,
  result,
  error,
}: {
  event: EventProfile;
  taskId: string | null;
  /** Recibido desde BoothMirror (suscripción a imageTasks/{taskId} arrancada
   * desde "loading", no acá) — con revealEffect="NONE" la fase salta directo
   * de "loading" a "result" sin ningún paso intermedio que le dé tiempo a
   * una suscripción propia de arrancar, así que si ResultView se suscribiera
   * recién al montarse se vería un salto/espera extra (doc ya listo en el
   * servidor, pero todavía sin llegar a este tab) justo en el caso que más
   * se nota por no tener ninguna animación de revelado que lo disimule. */
  result: TaskResult | null;
  error: string | null;
}) {
  const [qrSize, setQrSize] = useState(400);

  // Expandido/achicado ÚNICAMENTE por un toque en esta misma pantalla: no
  // depende en nada del toggle del líder. Solo se reinicia (achicado) cuando
  // cambia la foto, para que la siguiente sesión no arranque con el QR de la
  // anterior abierto.
  const [localShowQr, setLocalShowQr] = useState(false);
  useEffect(() => {
    setLocalShowQr(false);
  }, [taskId]);

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
      // El último tope (vw * 0.78) es para que la tarjeta ampliada nunca
      // sea más ancha que la pantalla en ventanas angostas (el QR lleva
      // padding lateral propio).
      setQrSize(Math.min(Math.max(280, vw * 0.38), vh * 0.36, vw * 0.78, 480));
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
    // Ver ResultStep: /survey se abre en el celular del asistente, así que el
    // evento viaja en la URL (es lo único que le permite mostrar sus logos).
    url.searchParams.set("eventId", event.id);
    return url.toString();
  }, [origin, taskId, result?.url, result?.videoUrl, enableFrame, frameSrc, event.id]);

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

  if (!mediaSrc) return <LoaderStep eventOverride={event} />;

  // Pantalla espejo vertical (1080x1920): object-contain, igual que
  // ResultStep en la tablet — se mantiene la proporción real de la
  // foto/video (con mate negro a los costados si hace falta) en vez de
  // estirarla para llenar el rectángulo.
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

      {/* Logos superiores, mismo layout que la pantalla de selección de
          filtro (EventPhotoBoothLanding) — para que el resultado en la
          pantalla espejo mantenga la misma identidad de marca arriba. */}
      <div className="absolute top-0 inset-x-0 z-30 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 sm:pb-3 md:pb-4">
        <TopLogosBar event={event} />
      </div>

      <BrandingOverlay event={event} />

      {/* Sello chico y tarjeta ampliada son DOS elementos siempre montados que
          se cruzan con opacidad + escala, en vez de un solo nodo que cambia de
          esquina a centro: animar `left`/`right`/`width` entre esos dos anclajes
          no interpola (salta de golpe), mientras que transform+opacity sí da una
          transición suave y sin repintar la foto de fondo. */}
      {surveyUrl && (
        <>
          <button
            type="button"
            onClick={() => setLocalShowQr(true)}
            aria-label="Agrandar el código QR"
            aria-hidden={localShowQr}
            tabIndex={localShowQr ? -1 : 0}
            className={`absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-black/10 origin-bottom-right transition-all duration-300 ease-out ${
              localShowQr
                ? "opacity-0 scale-75 pointer-events-none"
                : "opacity-100 scale-100 active:scale-95"
            }`}
          >
            <QrTag value={surveyUrl} size={112} />
          </button>

          {/* Ampliado: tarjeta centrada sobre el borde inferior, con alto
             SEGÚN SU CONTENIDO (nada de 42vh fijo, que dejaba media franja
             blanca vacía debajo del QR) y despegada del borde para que se lea
             como tarjeta y no como un recorte de la pantalla. */}
          <button
            type="button"
            onClick={() => setLocalShowQr(false)}
            aria-label="Achicar el código QR"
            aria-hidden={!localShowQr}
            tabIndex={localShowQr ? 0 : -1}
            className={`absolute left-1/2 bottom-[6vh] z-40 flex flex-col items-center gap-4 rounded-3xl bg-white px-7 py-7 shadow-2xl ring-1 ring-black/10 origin-bottom transition-all duration-300 ease-out ${
              localShowQr
                ? "opacity-100 scale-100 -translate-x-1/2 translate-y-0"
                : "opacity-0 scale-90 -translate-x-1/2 translate-y-8 pointer-events-none"
            }`}
          >
            <QrTag value={surveyUrl} size={qrSize} />
            <span
              className="max-w-[85%] text-center font-semibold leading-tight text-black/80"
              style={{ fontSize: "clamp(1rem, 2.2vw, 1.6rem)" }}
            >
              Escanea para descargar tu foto en tu celular
            </span>
          </button>
        </>
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
  result,
  error,
}: {
  event: EventProfile;
  taskId: string | null;
  reportRevealDone: (taskId: string) => void;
  /** Ver mismo comentario en ResultView — recibido desde BoothMirror en vez
   * de suscribirse acá, para que la espera de red quede escondida detrás del
   * "loading" en vez de sumarse recién al entrar a "reveal". */
  result: TaskResult | null;
  error: string | null;
}) {
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

  if (!mediaSrc) return <LoaderStep eventOverride={event} />;

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

/** Revelado con la mano REAL (MediaPipe) para revealEffect="HAND_WIPE" (el
 * default) cuando hay pantalla espejo habilitada — el mismo PC que maneja
 * esta pantalla gigante tiene una cámara propia (montada arriba, apuntando a
 * las manos) para detectar el gesto, así que a diferencia de la tablet (que
 * solo captura la foto) acá SÍ hay alguien revelándola de verdad. Igual que
 * KinectRevealView, espera a que la imagen generada esté lista antes de
 * montar el velo, y avisa al líder vía `reportRevealDone` cuando termina.
 * Sin pantalla espejo (kiosco de un solo dispositivo), este componente nunca
 * se monta — el tablet revela localmente, ver PhotoBoothWizard. */
function HandRevealMirrorView({
  event,
  taskId,
  reportRevealDone,
  result,
  error,
}: {
  event: EventProfile;
  taskId: string | null;
  reportRevealDone: (taskId: string) => void;
  /** Ver mismo comentario en ResultView/KinectRevealView — recibido desde
   * BoothMirror en vez de suscribirse acá. */
  result: TaskResult | null;
  error: string | null;
}) {
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

  if (!mediaSrc) return <LoaderStep eventOverride={event} />;

  return (
    <div className="fixed inset-0 bg-black">
      <RevealStep
        key={taskId}
        aiUrl={mediaSrc}
        videoUrl={result?.videoUrl}
        frameSrc={event.frameImage ?? null}
        enableFrame={event.enableFrame ?? true}
        handTrackingEnabled={event.handRevealEnabled === true}
        paintTimeSeconds={event.paintTimeSeconds}
        aspectRatio={event.photoAspectRatio}
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
  connected,
  reportRevealDone,
}: {
  event: EventProfile;
  state: BoothLiveState | null;
  isStale: boolean;
  connected: boolean;
  reportRevealDone: (taskId: string) => void;
}) {
  // Arrancada acá (no dentro de ResultView/KinectRevealView) para que la
  // suscripción a imageTasks/{taskId} - y por lo tanto el primer round-trip
  // de red hasta tener `result.url` - ya esté en curso desde "loading",
  // bastante antes de llegar a "result". Con revealEffect="NONE" esos dos
  // pasos son consecutivos (sin ningún paso de revelado en el medio que
  // disimule esa espera), así que si se arrancara recién al montar
  // ResultView la foto tardaría en aparecer un instante después de que la
  // fase ya diga "result" en vez de mostrarse al toque.
  const { result: taskResult, error: taskError } = useTaskResult(state?.taskId ?? null);

  const content = (() => {
    if (!state || isStale) {
      return <MirrorIdleScreen event={event} />;
    }

    switch (state.phase) {
      case "splash":
        // Sin `wide`: mismo diseño que la tablet líder en la pantalla
        // espejo vertical.
        return <SplashScreen event={event} onStart={NOOP} />;

      case "landing":
      case "filter":
        // Sin `wide`: esta pantalla espejo es vertical (1080x1920), como la
        // tablet líder — se usa el mismo diseño/proporciones de origen
        // (tarjetas aspect-square, max-w-[1200px]) en vez del layout pensado
        // para una pantalla gigante apaisada 1920x1080.
        return (
          <EventPhotoBoothLanding
            event={event}
            readOnly
            selectedBrandOverride={state.brand}
          />
        );

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
              logoLeftScalePct={event.logoTopScalePct}
              logoRightScalePct={event.logoBottomScalePct}
              aspectRatio={event.photoAspectRatio}
            />
          </MirrorStage>
        );

      case "loading":
        return <LoaderStep brandIdOverride={state.brand} eventOverride={event} />;

      case "reveal": {
        // revealEffect="KINECT_ROLLER": la pantalla gigante ES el Kinect, así
        // que acá SÍ hay alguien tocándola de verdad — se revela con el
        // rodillo real y se le avisa al líder cuando termina.
        // revealEffect="HAND_WIPE" (default): el PC que maneja esta pantalla
        // gigante tiene su propia cámara (MediaPipe) apuntando a las manos —
        // mismo trato, la foto en negro se revela ACÁ, no en la tablet (que
        // solo capturó la foto). Para ROLLER/ROLLER_COLOR, quien gesticula
        // sigue estando frente a la tablet, así que ahí sí solo se muestra un
        // mensaje hasta que el líder reporte "result".
        const revealEffect = event.revealEffect ?? "HAND_WIPE";
        if (revealEffect === "KINECT_ROLLER") {
          return (
            <KinectRevealView
              event={event}
              taskId={state.taskId}
              reportRevealDone={reportRevealDone}
              result={taskResult}
              error={taskError}
            />
          );
        }
        if (revealEffect === "HAND_WIPE") {
          return (
            <HandRevealMirrorView
              event={event}
              taskId={state.taskId}
              reportRevealDone={reportRevealDone}
              result={taskResult}
              error={taskError}
            />
          );
        }
        return <FullBleedMessage event={event} title="Revelando foto…" />;
      }

      case "result":
        return (
          <ResultView
            event={event}
            taskId={state.taskId}
            result={taskResult}
            error={taskError}
          />
        );

      default:
        return <MirrorIdleScreen event={event} />;
    }
  })();

  return (
    <>
      {content}

      {/* Salvapantallas espejado: en modo pasivo (ver prop `mirrorActive`),
          abre y cierra siguiendo al líder — tanto por inactividad como por el
          botón oculto del logo. Con el líder caído (`isStale`) se cierra y
          deja ver el mensaje de "Esperando actividad…", en vez de quedar
          congelado sobre una pantalla que ya no refleja nada. */}
      <ScreenSaver event={event} mirrorActive={!isStale && state?.screenSaverActive === true} />

      <LiveSessionStatusBadge
        role="mirror"
        connected={connected}
        isStale={isStale}
        phase={state?.phase ?? null}
        brand={state?.brand ?? null}
        taskId={state?.taskId ?? null}
        updatedAt={state?.updatedAt ?? null}
      />
    </>
  );
}
