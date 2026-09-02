/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import EventPhotoBoothLanding from "@/app/components/photo-booth/EventPhotoBoothLanding";
import CaptureStep from "@/app/components/photo-booth/CaptureStep";
import PreviewStep from "@/app/components/photo-booth/PreviewStep";
import LoaderStep from "@/app/components/photo-booth/LoaderStep";
import RevealStep from "@/app/components/photo-booth/RevealStep";
import RollerRevealStep from "@/app/components/photo-booth/reveal/RollerRevealStep";
import { ROLLER_MODEL_PATH } from "@/app/components/photo-booth/reveal/RollerCursor";
import ResultStep from "@/app/components/photo-booth/ResultStep";
import ImageCustomizeStep, { type ImageCustomization } from "@/app/components/photo-booth/ImageCustomizeStep";
import { LOGO_BAR_VARIANTS, stepVariantsFor } from "@/app/components/photo-booth/stepTransitions";
import { getStyleProfileById } from "@/app/services/admin/styleService";
import type { StyleProfile } from "@/app/services/admin/styleService";
import {
  getEventProfileBySlug,
  type EventProfile,
} from "@/app/services/photo-booth/eventService";
import { getPhotoBoothPromptById } from "@/app/services/photo-booth/brandService";
import {
  LOGO_BAR_BOTTOM_MAX_WIDTH,
  LOGO_BAR_HEIGHT,
  LOGO_BAR_PADDING,
  LOGO_BAR_TOP_MAX_WIDTH,
  scaledLogoStyle,
} from "@/app/components/photo-booth/logoBarSizing";
import { useSearchParams } from "next/navigation";
import { uploadCapturedPhoto } from "@/app/components/photo-booth/photoUpload";
import { downscaleDataUrl } from "@/app/components/photo-booth/imageResize";
import {
  captureQualityFor,
  previewUploadQualityFor,
} from "@/app/components/photo-booth/lowBandwidthMode";
import { db } from "@/firebaseConfig";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { event } from "firebase-functions/v1/analytics";
import type { BoothLiveState } from "@/app/components/photo-booth/useBoothLiveSession";

const CONFIRM_MAX_AUTO_RETRIES = 3;

/**
 * Cuánto se espera a que la escritura del doc de `imageTasks` llegue al
 * servidor antes de considerarla fallida.
 *
 * Hace falta un reloj propio porque `setDoc` no avisa: el SDK de Firestore
 * encola la escritura localmente y su promesa solo resuelve con el ACK del
 * servidor — sin red no rechaza NUNCA. La señal real es el snapshot: el
 * listener dispara al instante con la escritura pendiente
 * (`metadata.hasPendingWrites === true`, compensación de latencia) y vuelve a
 * disparar con `false` recién cuando el servidor la confirmó.
 */
const TASK_WRITE_ACK_TIMEOUT_MS = 30_000;

export default function PhotoBoothWizard({
  mirror = true,
  // Caja cuadrada responsiva: mínimo 320px, escala con viewport
  boxSize = "min(80vw, 80vh)",
  borderRadius = "4xl",
  eventData,
  onReset,
  onLiveState,
  remoteRevealedTaskId,
}: {
  frameSrc?: string | null;
  /** Voltea la cámara como espejo de selfie — sin relación con el "modo
   * espejo" de sincronización entre pantallas (ver useBoothLiveSession). */
  mirror?: boolean;
  boxSize?: string;
  borderRadius?: "none" | "md" | "lg" | "xl" | "4xl";
  eventData?: EventProfile;
  onReset?: () => void;
  /** Notifica cada cambio de paso/foto/selección relevante para que la
   * pantalla espejo (otro tab/dispositivo) se mantenga sincronizada. Solo lo
   * pasa el tab líder — ver src/app/(public)/booth/[slug]/page.tsx. */
  onLiveState?: (partial: Partial<Omit<BoothLiveState, "leaderId" | "updatedAt">>) => void;
  /** taskId que la pantalla espejo (pantalla gigante + Kinect) reportó como
   * ya revelado — ver BoothLiveState.revealedTaskId. Solo relevante con
   * revealEffect="KINECT_ROLLER", donde el revelado ocurre allá, no acá. */
  remoteRevealedTaskId?: string | null;
}) {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<
    "capture" | "preview" | "filter" | "customize" | "loading" | "reveal" | "result"
  >("capture");
  const [framedShot, setFramedShot] = useState<string | null>(null);
  const [rawShot, setRawShot] = useState<string | null>(null);
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [aiVideoUrl, setAiVideoUrl] = useState<string | null>(null);
  const [framedUrl, setFramedUrl] = useState<string | null>(null);
  const [mirrorPreviewUrl, setMirrorPreviewUrl] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [customization, setCustomization] = useState<ImageCustomization | null>(null);
  const [showQr, setShowQr] = useState(false);
  // Estado de reintento de confirmAndProcess (subida + doc de Firestore) en
  // conexiones lentas/inestables — ver comentario en confirmAndProcess.
  const [generationRetry, setGenerationRetry] = useState<{
    attempt: number;
    stalled: boolean;
  } | null>(null);
  const unsubRef = useRef<() => void | undefined>(undefined);
  // Reintento automático de confirmAndProcess programado. Se guarda para
  // poder cancelarlo: sin esto, un reset (salvapantallas, botón de rescate,
  // "tomar otra foto") dejaba el timer vivo y unos segundos después la
  // closure vieja — con el `framedShot` de la sesión anterior todavía
  // capturado — devolvía la pantalla a "loading" sola.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reloj que vigila que la escritura del doc llegue al servidor (ver
  // TASK_WRITE_ACK_TIMEOUT_MS).
  const writeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Permite abortar las subidas en vuelo cuando se reinicia el flujo, en vez
  // de dejarlas peleando por el enlace mientras el siguiente asistente ya
  // está tomando su foto.
  const uploadAbortRef = useRef<AbortController | null>(null);
  // Subidas tempranas disparadas en handleCaptured (ver más abajo) —
  // confirmAndProcess las espera en vez de volver a subir la misma foto.
  const framedUploadRef = useRef<Promise<{ url: string; path: string }> | null>(null);
  const mirrorPreviewUploadRef = useRef<Promise<{ url: string; path: string }> | null>(null);
  const [style, setStyle] = useState<StyleProfile | null>(null);

  // El modo ahorro de datos llega ya APLICADO sobre el evento: la página del
  // booth deriva el EventProfile con applyLowBandwidth, así que revealEffect,
  // handRevealEnabled, etc. vienen resueltos. Lo único que queda por decidir
  // acá es cuánto comprimir lo que se sube — ver lowBandwidthMode.ts.
  const lowBandwidth = eventData?.lowBandwidthMode === true;

  // revealEffect="KINECT_ROLLER" siempre, y revealEffect="HAND_WIPE" (default)
  // cuando hay pantalla espejo habilitada: el revelado ocurre en la pantalla
  // gigante (BoothMirror + cámara con MediaPipe apuntando a las manos, o
  // Kinect real), no acá — esta tab solo espera a que la pantalla espejo
  // reporte terminado el revelado de ESTA foto (comparando taskId, no un
  // booleano suelto, para no adelantarse con el de una ronda anterior) y
  // recién ahí avanza a "result". Sin pantalla espejo (kiosco de un solo
  // dispositivo), HAND_WIPE se revela acá mismo con la cámara/dedo del tablet
  // — ver la rama del render más abajo.
  const revealedByMirror =
    eventData?.revealEffect === "KINECT_ROLLER" ||
    ((eventData?.revealEffect ?? "HAND_WIPE") === "HAND_WIPE" && eventData?.mirrorScreenEnabled !== false);

  useEffect(() => {
    if (step !== "reveal") return;
    if (!revealedByMirror) return;
    if (!taskId || !remoteRevealedTaskId) return;
    if (remoteRevealedTaskId === taskId) setStep("result");
  }, [step, revealedByMirror, taskId, remoteRevealedTaskId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1) Primero intentar leer desde sessionStorage (establecido por EventPhotoBoothLanding)
    try {
      const storedBrand = sessionStorage.getItem("selectedBrand");
      const storedColor = sessionStorage.getItem("selectedColor");

      if (storedBrand) {
        setBrand(storedBrand);
      }

      if (storedColor) {
        setColor(storedColor);
      }
    } catch (e) {
      // Silently continue
    }

    // 2) Si no están en sessionStorage, intentar desde searchParams
    if (searchParams) {
      const brandParam = searchParams.get("brand");
      const colorParam = searchParams.get("color");

      if (brandParam && !sessionStorage.getItem("selectedBrand")) {
        setBrand(brandParam);
      }
      if (colorParam && !sessionStorage.getItem("selectedColor")) {
        setColor(colorParam);
      }
    } else {
      // Fallback: leer directamente del window.location
      const params = new URLSearchParams(window.location.search);
      const brandParam = params.get("brand");
      const colorParam = params.get("color");

      if (brandParam && !sessionStorage.getItem("selectedBrand")) {
        setBrand(brandParam);
      }
      if (colorParam && !sessionStorage.getItem("selectedColor")) {
        setColor(colorParam);
      }
    }

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = undefined;
      }
    };
  }, [searchParams]);

  // Load style if styleId present in query (so styles persist across steps)
  useEffect(() => {
    const loadStyle = async () => {
      try {
        console.log("[PhotoBoothWizard] loadStyle effect running");

        // 1) Si tenemos eventData, usarlo como estilo
        if (eventData) {
          console.log(
            "[PhotoBoothWizard] Using eventData as style:",
            eventData.name,
          );
          // Convertir EventProfile a StyleProfile
          const eventAsStyle: StyleProfile = {
            id: eventData.id,
            name: eventData.name,
            bgLanding: eventData.bgImage,
            bgCapture: eventData.bgImage,
            bgLoading: eventData.bgImage,
            bgResults: eventData.bgImage,
            logoLandingTop: eventData.logoTop,
            logoLandingBottom: eventData.logoBottom,
            logoCaptureTop: eventData.logoTop,
            logoCaptureBottom: eventData.logoBottom,
            logoLoadingTop: eventData.logoTop,
            logoLoadingBottom: eventData.logoBottom,
            logoResultsTop: eventData.logoTop,
            logoResultsBottom: eventData.logoBottom,
            frameImage: eventData.frameImage,
            enableFrame: !!eventData.frameImage,
            brands: null,
          };
          setStyle(eventAsStyle);
          // También guardarlo en sessionStorage
          sessionStorage.setItem(
            "photoBoothStyle",
            JSON.stringify(eventAsStyle),
          );
          return;
        }

        const params = new URLSearchParams(window.location.search);
        let styleId = params.get("styleId");

        if (!styleId) {
          // Fallback: try to extract styleId from pathname (e.g. /<styleId>)
          const path = window.location.pathname || "";
          const segments = path.split("/").filter(Boolean);
          if (segments.length >= 1) {
            styleId = segments[0];
            console.log(
              "[PhotoBoothWizard] derived styleId from pathname:",
              styleId,
            );
          }
        } else {
          console.log("[PhotoBoothWizard] found styleId in search:", styleId);
        }

        // Try sessionStorage first - busca currentEvent (evento) o photoBoothStyle (estilo antiguo)
        try {
          let cached = sessionStorage.getItem("currentEvent");
          if (!cached) {
            cached = sessionStorage.getItem("photoBoothStyle");
          }
          if (cached) {
            const parsed = JSON.parse(cached);
            console.log(
              "[PhotoBoothWizard] found cached data in sessionStorage:",
              parsed?.id || parsed?.slug,
            );
            // If there's no explicit styleId OR cached matches requested styleId, use cached
            if (!styleId || parsed?.id === styleId) {
              setStyle(parsed);
              return;
            }
            console.log(
              "[PhotoBoothWizard] cached style id differs from requested styleId, fetching requested style",
            );
          }
        } catch (e) {
          console.warn("[PhotoBoothWizard] error reading sessionStorage", e);
        }

        if (!styleId) {
          console.log(
            "[PhotoBoothWizard] no styleId found in search or pathname and no cached style",
          );
          return;
        }

        const s = await getStyleProfileById(styleId);
        setStyle(s);
        console.log("[PhotoBoothWizard] loaded style object:", s);
        try {
          console.log(
            "[PhotoBoothWizard] loaded style JSON:\n",
            JSON.stringify(s, null, 2),
          );
        } catch (e) {
          console.log("[PhotoBoothWizard] could not stringify style", e);
        }
      } catch (err) {}
    };
    loadStyle();
  }, []);

  // Precarga el modelo 3D del rodillo y, si aplica, el modelo ONNX de
  // detección del rodillo real + su binario WASM, lo antes posible (apenas
  // se sabe que el evento usa este efecto), así llegan descargados/en caché
  // del navegador mucho antes de que termine la generación y se necesiten
  // en RevealStep.
  useEffect(() => {
    const usesRoller = eventData?.revealEffect === "ROLLER" || eventData?.revealEffect === "ROLLER_COLOR";
    if (!usesRoller) return;
    if (typeof document === "undefined") return;

    const prefetch = (href: string) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "fetch";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    };

    prefetch(ROLLER_MODEL_PATH);
    // La detección del rodillo real (rollerDetectionStore) ya no depende de
    // handRevealEnabled — corre siempre que se usa este efecto, así que la
    // precarga tampoco debe depender de ese flag.
    prefetch("/models/rodillo-detector/best.onnx");
    prefetch("/ort/ort-wasm-simd-threaded.asyncify.wasm"); // backend WebGPU (se intenta primero)
    prefetch("/ort/ort-wasm-simd-threaded.wasm"); // backend WASM (fallback)
  }, [eventData?.revealEffect]);

  const handleCaptured = (payload: { framed: string; raw: string }) => {
    setFramedShot(payload.framed);
    setRawShot(payload.raw);
    setStep("preview");

    // Subida temprana (no bloqueante): el taskId se genera acá en vez de en
    // confirmAndProcess para que, desde el momento de la captura, exista una
    // URL de Storage real que una pantalla espejo (otro tab/dispositivo)
    // pueda mostrar durante preview/customize — antes de este cambio la foto
    // solo existía como data: URL en memoria de este tab. confirmAndProcess
    // reutiliza esta misma subida (framedUploadRef) en vez de repetirla.
    const newTaskId = `t_${Math.random()
      .toString(36)
      .slice(2, 10)}_${Date.now().toString(36)}`;
    setTaskId(newTaskId);

    uploadAbortRef.current?.abort();
    const abort = new AbortController();
    uploadAbortRef.current = abort;

    const framedPromise = uploadCapturedPhoto(
      payload.framed,
      `tasks/${newTaskId}/input.jpg`,
      { signal: abort.signal }
    );
    framedUploadRef.current = framedPromise;
    framedPromise
      .then((res) => setFramedUrl(res.url))
      .catch((e) => console.error("[PhotoBoothWizard] Early framed upload failed:", e));

    // Copia sin marco para la pantalla espejo, y SOLO para eso: es lo único
    // que la mira. Se sube reescalada (y no se sube en absoluto si el evento
    // no usa pantalla espejo) porque mandarla a resolución completa duplicaba
    // los bytes de la captura compitiendo con la subida que sí importa — la
    // que va a la IA — justo en el enlace lento que se quiere aliviar. La
    // copia local (`rawShot`) sigue en calidad completa: nunca sale del
    // dispositivo.
    if (payload.raw && eventData?.mirrorScreenEnabled !== false) {
      const previewQuality = previewUploadQualityFor(lowBandwidth);
      const previewPromise = downscaleDataUrl(
        payload.raw,
        previewQuality.maxSide,
        previewQuality.quality
      ).then((small) =>
        uploadCapturedPhoto(small, `tasks/${newTaskId}/preview.jpg`, {
          signal: abort.signal,
        })
      );
      mirrorPreviewUploadRef.current = previewPromise;
      previewPromise
        .then((res) => setMirrorPreviewUrl(res.url))
        .catch((e) =>
          console.error("[PhotoBoothWizard] Early mirror preview upload failed:", e)
        );
    }
  };

  // Si el evento tiene "captura primero" activado y hay más de una marca
  // para elegir, la selección de filtro se muestra recién después de
  // confirmar el preview (en vez de antes de la captura).
  const needsFilterStep =
    eventData?.captureBeforeFilter === true && (eventData?.prompts?.length ?? 0) > 1;
  // Pantalla opcional "Dale tu toque" (paleta/textura/intensidad), habilitada
  // por evento. Se muestra después del filtro (si aplica) y justo antes de
  // generar, para que sus valores viajen en el mismo doc de imageTasks.
  const needsCustomizeStep = eventData?.imageCustomizationEnabled === true;

  // Continúa hacia el siguiente paso pendiente antes de generar (personalizar
  // si está habilitado; si no, genera directo).
  const proceedAfterFilterOrPreview = () => {
    if (needsCustomizeStep) {
      setStep("customize");
    } else {
      void confirmAndProcess();
    }
  };

  const handlePreviewConfirm = () => {
    if (needsFilterStep) {
      setStep("filter");
    } else {
      proceedAfterFilterOrPreview();
    }
  };

  const handleFilterSelected = (selectedBrand?: string, dataProcessingAccepted?: boolean) => {
    if (selectedBrand) {
      setBrand(selectedBrand);
      sessionStorage.setItem("selectedBrand", selectedBrand);
    }
    if (dataProcessingAccepted !== undefined) {
      sessionStorage.setItem("dataProcessingAccepted", String(dataProcessingAccepted));
    }
    proceedAfterFilterOrPreview();
  };

  const handleCustomizeConfirmed = (value: ImageCustomization) => {
    setCustomization(value);
    void confirmAndProcess(value);
  };

  /** Cancela el reintento programado y el reloj de la escritura. Se llama
   * antes de cada intento nuevo y en cada salida del flujo de generación. */
  const clearGenerationTimers = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (writeWatchdogRef.current) {
      clearTimeout(writeWatchdogRef.current);
      writeWatchdogRef.current = null;
    }
  };

  // `attempt` solo lo pasa la propia función al reintentarse — no forma
  // parte de la llamada normal (customize/filter confirmados).
  const confirmAndProcess = async (
    customizationOverride?: ImageCustomization,
    attempt = 0
  ) => {
    if (!framedShot) return;
    // El estado `customization` puede no haberse actualizado todavía cuando
    // se llama justo después de setCustomization (batching de React), así
    // que se acepta el valor fresco como override.
    const finalCustomization = customizationOverride ?? customization;
    clearGenerationTimers();
    setStep("loading");
    setGenerationRetry(attempt > 0 ? { attempt, stalled: false } : null);

    /** Ruta común de fallo de conexión: reintenta la operación entera sin
     * recapturar (la foto ya tomada sigue en memoria) y, agotados los
     * reintentos automáticos, ofrece el botón manual sin resetear el flujo.
     * Antes esto era un alert() + volver a "preview", que obligaba al
     * asistente a repetir filtro y personalización. */
    const handleConnectionFailure = (e: unknown) => {
      console.error("[PhotoBoothWizard] Error in confirmAndProcess:", e);
      clearGenerationTimers();
      if (attempt < CONFIRM_MAX_AUTO_RETRIES) {
        const delayMs = Math.min(2000 * 2 ** attempt, 10000);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void confirmAndProcess(finalCustomization ?? undefined, attempt + 1);
        }, delayMs);
      } else {
        setGenerationRetry({ attempt, stalled: true });
      }
    };

    try {
      // handleCaptured ya generó el taskId y disparó la subida en cuanto se
      // tomó la foto (para que la pantalla espejo tuviera algo que mostrar
      // durante preview/customize) — se reutiliza acá en vez de repetirla.
      // El fallback (sin taskId/promesa) cubre el caso defensivo de que este
      // método se invoque sin haber pasado por handleCaptured.
      const newTaskId =
        taskId ??
        `t_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      if (!taskId) setTaskId(newTaskId);

      let framedDownloadUrl: string;
      let inputPath: string;
      try {
        const uploaded = framedUploadRef.current
          ? await framedUploadRef.current
          : await uploadCapturedPhoto(framedShot, `tasks/${newTaskId}/input.jpg`);
        framedDownloadUrl = uploaded.url;
        inputPath = uploaded.path;
      } catch {
        // La subida temprana falló (ej. corte de red momentáneo) — un
        // intento fresco acá, ya con sus propios reintentos con backoff. El
        // resultado reemplaza la promesa rechazada, así un reintento
        // posterior no vuelve a caer por este mismo camino.
        const uploaded = await uploadCapturedPhoto(framedShot, `tasks/${newTaskId}/input.jpg`);
        framedUploadRef.current = Promise.resolve(uploaded);
        framedDownloadUrl = uploaded.url;
        inputPath = uploaded.path;
      }

      setFramedUrl(framedDownloadUrl);

      const taskRef = doc(collection(db, "imageTasks"), newTaskId);

      // 2) Suscripción ANTES de escribir el doc, y sin bloquear en la
      //    escritura.
      //
      //    `setDoc` solo resuelve con el ACK del servidor: sin red el SDK
      //    encola la escritura localmente y la promesa queda pendiente para
      //    siempre, no rechaza. Esperarla acá era el peor caso posible —
      //    ninguna excepción, así que ni reintento ni aviso ni botón: el
      //    loader quedaba colgado; y como el listener se registraba DESPUÉS
      //    del await, cuando la red volvía el doc sí se creaba y la Cloud
      //    Function generaba la foto, pero esta pantalla nunca se enteraba.
      //
      //    Suscribirse primero es seguro: un listener sobre un doc que aún no
      //    existe es válido y dispara con snapshot vacío (se ignora abajo).
      //    `includeMetadataChanges` es lo que hace visible el momento en que
      //    la escritura pasa de local a confirmada por el servidor.
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = undefined;
      }
      unsubRef.current = onSnapshot(
        taskRef,
        { includeMetadataChanges: true },
        async (snap) => {
          // El doc existe en el servidor => la escritura llegó => hay
          // conexión. Recién ahí se apaga el reloj de la escritura.
          if (snap.exists() && !snap.metadata.hasPendingWrites) {
            if (writeWatchdogRef.current) {
              clearTimeout(writeWatchdogRef.current);
              writeWatchdogRef.current = null;
            }
            setGenerationRetry(null);
          }

          const data = snap.data();
          if (!data) return;

          if (data.status === "error") {
            console.error("Task error:", data?.error || "unknown");
            clearGenerationTimers();
            setGenerationRetry(null);
            setStep("preview");
            return;
          }

          if (data.status === "done" && data.url) {
            console.log(
              "[PhotoBoothWizard] Task completed with result URL:",
              data.url,
            );
            clearGenerationTimers();
            setGenerationRetry(null);
            setAiUrl(data.url as string);
            if (data.videoUrl) setAiVideoUrl(data.videoUrl as string);
            // Por compatibilidad, eventos sin revealEffect configurado usan el
            // efecto original (borrar el velo con la mano).
            const revealEffect = eventData?.revealEffect ?? "HAND_WIPE";
            setStep(revealEffect === "NONE" ? "result" : "reveal");
            try {
              await updateDoc(taskRef, { finishedAt: serverTimestamp() });
            } catch {}
            if (unsubRef.current) {
              unsubRef.current();
              unsubRef.current = undefined;
            }
          }
        }
      );

      // Usar el brand/color del estado si existen, si no del sessionStorage
      const promptId =
        brand ||
        sessionStorage.getItem("selectedBrand") ||
        eventData?.prompts?.[0] ||
        null;
      const finalColor =
        color || sessionStorage.getItem("selectedColor") || null;

      // Leer aceptación de tratamiento de datos
      const dataProcessingAccepted = sessionStorage.getItem("dataProcessingAccepted") === "true";

      // Resolver el brand field a partir del promptId (la Cloud Function busca por 'brand')
      let finalBrand = "default";
      if (promptId) {
        try {
          const prompt = await getPhotoBoothPromptById(promptId);
          if (prompt) {
            // Usar el campo 'brand' que es lo que la Cloud Function busca
            finalBrand = prompt.brand || promptId;
            console.log("[PhotoBoothWizard] Resolved brand field:", {
              promptId,
              finalBrand,
              prompt,
            });
          } else {
            finalBrand = promptId; // Usar el ID como fallback
            console.warn(
              "[PhotoBoothWizard] Prompt not found, using ID:",
              promptId,
            );
          }
        } catch (error) {
          console.error("[PhotoBoothWizard] Error resolving prompt:", error);
          finalBrand = promptId || "default";
        }
      }

      console.log("[PhotoBoothWizard] Final brand and color:", {
        finalBrand,
        finalColor,
      });

      // 3) La escritura se dispara sin esperarla (ver arriba). Quien decide
      //    si llegó o no es el reloj: si el snapshot no confirma la escritura
      //    a tiempo, se trata como fallo de conexión. El `catch` de acá solo
      //    cubre errores reales de permisos/validación, que reintentar no
      //    arregla.
      writeWatchdogRef.current = setTimeout(() => {
        writeWatchdogRef.current = null;
        handleConnectionFailure(
          new Error("La foto no llegó al servidor (sin confirmación de escritura)")
        );
      }, TASK_WRITE_ACK_TIMEOUT_MS);

      void setDoc(taskRef, {
        status: "queued",
        inputPath,
        framedPath: inputPath,
        framedUrl: framedDownloadUrl,
        eventId: eventData?.id,
        brand: finalBrand,
        color: finalColor,
        prompt: finalBrand, // También enviar como 'prompt' para compatibilidad con Cloud Function
        promptId: promptId, // Guardar el ID también para referencia
        dataProcessingAccepted: dataProcessingAccepted, // Guardar aceptación de tratamiento de datos
        // Ajustes opcionales de "Dale tu toque" (paleta/textura/intensidad),
        // aplicados al prompt de IA en la Cloud Function.
        palette: finalCustomization?.palette ?? null,
        texture: finalCustomization?.texture ?? null,
        intensity: finalCustomization?.intensity ?? null,
        // Relación de aspecto pedida para la SALIDA de la IA, ya en el
        // formato que espera Gemini ("3:4" o "1:1") - la Cloud Function la
        // usa con prioridad sobre volver a leer event.photoAspectRatio (ver
        // processImageTask en functions/src/index.ts).
        aspectRatio: eventData?.photoAspectRatio === "3:4" ? "3:4" : "1:1",
        taskId: newTaskId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((e) => {
        console.error("[PhotoBoothWizard] imageTasks write rejected:", e);
      });
    } catch (e) {
      handleConnectionFailure(e);
    }
  };

  const retryGenerationNow = () => {
    void confirmAndProcess(customization ?? undefined, 0);
  };

  const resetAll = () => {
    // Cortar todo lo que pudiera seguir corriendo de la sesión anterior ANTES
    // de decidir a dónde volver: un reintento programado que sobreviva al
    // reset ejecuta su closure vieja (con el `framedShot` ya descartado
    // todavía capturado) y devuelve la pantalla a "loading" sola unos
    // segundos después; y las subidas en vuelo seguirían peleando por el
    // enlace mientras el siguiente asistente toma su foto.
    clearGenerationTimers();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = undefined;
    }

    // Si hay una función onReset (desde EventBoothPage con múltiples brands), llamarla para volver a la selección de brand
    if (onReset) {
      onReset();
      return;
    }
    
    // Si no hay onReset (evento con una sola brand), simplemente reiniciar desde capture
    setFramedShot(null);
    setRawShot(null);
    setAiUrl(null);
    setAiVideoUrl(null);
    setFramedUrl(null);
    setMirrorPreviewUrl(null);
    setTaskId(null);
    setCustomization(null);
    setShowQr(false);
    setGenerationRetry(null);
    framedUploadRef.current = null;
    mirrorPreviewUploadRef.current = null;
    setStep("capture");
  };

  // Al desmontar (cambio de evento, salir del booth) no debe quedar nada
  // programado: un reintento pendiente llamaría a setState sobre un
  // componente muerto, y una subida en vuelo seguiría ocupando el enlace.
  useEffect(() => {
    return () => {
      clearGenerationTimers();
      uploadAbortRef.current?.abort();
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = undefined;
      }
    };
  }, []);

  // Notifica a la pantalla espejo (si la hay) cada vez que cambia algo que
  // afecta lo que debería estar mostrando — ver useBoothLiveSession/BoothMirror.
  // No-op si nadie pasó onLiveState (el caso normal, sin espejo activo).
  useEffect(() => {
    onLiveState?.({
      phase: step,
      taskId,
      brand,
      customization,
      previewUrl: mirrorPreviewUrl || framedUrl || null,
      showQr,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, taskId, brand, customization, mirrorPreviewUrl, framedUrl, showQr]);

  // Cada paso trae su propia transición de entrada/salida (ver
  // `stepTransitions.ts`, que documenta el criterio de cada una). Dos cosas
  // que valen para todas y que conviene no romper:
  //
  // 1) Los pasos NO se turnan: `AnimatePresence` va sin `mode="wait"` y los
  //    pasos conviven superpuestos (`absolute inset-0` en la caja de
  //    contenido, `fixed inset-0` los de pantalla completa). Con
  //    `mode="wait"` la salida terminaba ANTES de que entrara el siguiente y
  //    quedaba ~0.35s de contenedor vacío en el que el fondo y los logos YA
  //    habían cambiado (viven fuera del AnimatePresence): se veía como si el
  //    loader se montara primero y recién después se cayera el preview.
  //
  // 2) Las transiciones usan transforms, y un transform activo crea un
  //    containing block. Por eso los pasos que renderizan un hijo
  //    `fixed inset-0` (filter, capture, loading) se animan dentro de un
  //    wrapper que también es `fixed inset-0`: la caja de referencia termina
  //    siendo idéntica al viewport y el hijo no salta de tamaño al terminar
  //    la animación. Si esos wrappers volvieran a estar acotados por
  //    `boxSize`, el loader se vería del tamaño de la caja durante la
  //    transición y pegaría un salto a pantalla completa al final.
  const reduceMotion = useReducedMotion();

  // Los campos de logo del admin se guardan como "" cuando no se sube nada.
  // Pasar eso a `src` no solo dispara el warning de React ("An empty string was
  // passed to the src attribute"), sino que además deja renderizado un <img>
  // vacío que igual ocupa el alto de la barra — el "cuadro esperando una
  // imagen". Sin logo utilizable no se renderiza la barra en absoluto.
  const usableLogo = (url?: string | null): string | null => {
    const trimmed = typeof url === "string" ? url.trim() : "";
    return trimmed || null;
  };

  // Tamaño de logos configurado en el admin. `eventData` es la fuente normal
  // (booth/[slug] lo pasa como prop), pero por la ruta legacy `?styleId=` el
  // wizard solo tiene `style`, que en esa ruta es el EventProfile crudo leído
  // de sessionStorage("currentEvent") — de ahí el fallback, si no el tamaño
  // elegido se perdía en todas las pantallas de ese flujo.
  const cachedEventConfig = style as unknown as Partial<EventProfile> | null;
  const logoTopScalePct =
    eventData?.logoTopScalePct ?? cachedEventConfig?.logoTopScalePct;
  const logoBottomScalePct =
    eventData?.logoBottomScalePct ?? cachedEventConfig?.logoBottomScalePct;

  const topLogoSrc = style
    ? usableLogo(
        step === "loading"
          ? style.logoLoadingTop || style.logoLandingTop
          : step === "result" || step === "reveal"
            ? style.logoResultsTop || style.logoLandingTop
            : style.logoLandingTop
      )
    : "/genilaty_smart_led_logo.png";

  const bottomLogoSrc = style
    ? usableLogo(
        step === "loading"
          ? style.logoLoadingBottom || style.logoLandingBottom
          : step === "result" || step === "reveal"
            ? style.logoResultsBottom || style.logoLandingBottom
            : style.logoLandingBottom
      )
    : "/genilaty_smart_led_logo.png";

  const bgUrl = style
    ? step === "capture"
      ? style.bgCapture || style.bgLanding
      : step === "loading"
        ? style.bgLoading || style.bgLanding
        : step === "result" || step === "reveal"
          ? style.bgResults || style.bgLanding
          : style.bgLanding
    : "/Lenovo/app-avatars-01.png";

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      {/* Pasos a pantalla completa: selección de filtro, cámara y loader.
          Van en su propio AnimatePresence, fuera de la caja de contenido de
          más abajo, por dos motivos:

          - Necesitan el viewport entero. La caja de contenido está acotada
            por `boxSize` y les recortaría el encuadre (la cámara sobre todo).
          - Los tres renderizan un hijo `fixed inset-0`, y la animacion usa
            transforms: cada wrapper crea un containing block, así que el hijo
            se ancla al wrapper. Siendo el wrapper también `fixed inset-0`, esa
            caja coincide con el viewport y no hay salto al terminar.

          Este AnimatePresence y el de la caja de contenido corren en paralelo,
          así que un paso de acá cruza en opacidad con uno de alla sin hueco
          intermedio (cámara -> preview, preview -> loader, loader -> result). */}
      <AnimatePresence initial={false}>
        {step === "filter" && eventData && (
          <motion.div
            key="filter"
            className="fixed inset-0 z-40"
            variants={stepVariantsFor("filter", reduceMotion)}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <EventPhotoBoothLanding
              event={eventData}
              onStart={handleFilterSelected}
              buttonLabel="Generar la magia"
            />
          </motion.div>
        )}

        {step === "capture" && (
          <motion.div
            key="capture"
            className="fixed inset-0 z-30"
            variants={stepVariantsFor("capture", reduceMotion)}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <CaptureStep
              mirror={mirror}
              onCaptured={handleCaptured}
              frameSrc={eventData?.frameImage ?? style?.frameImage ?? null}
              buttonImage={eventData?.buttonImage}
              buttonClickEffect={eventData?.buttonClickEffect}
              viewStyle={eventData?.captureViewStyle}
              logoLeftSrc={style ? style.logoCaptureTop || style.logoLandingTop : "/genilaty_smart_led_logo.png"}
              logoRightSrc={style ? style.logoCaptureBottom || style.logoLandingBottom : "genilaty_smart_led_logo.png"}
              logoLeftScalePct={logoTopScalePct}
              logoRightScalePct={logoBottomScalePct}
              backgroundSrc={bgUrl}
              aspectRatio={eventData?.photoAspectRatio}
              captureQuality={captureQualityFor(lowBandwidth)}
            />
          </motion.div>
        )}

        {step === "loading" && (
          <motion.div
            key="loading"
            className="fixed inset-0 z-50"
            variants={stepVariantsFor("loading", reduceMotion)}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <LoaderStep eventOverride={eventData ?? null} />

            {/* Reintento de conexión (subida/creación del task en Firestore),
                sin resetear el flujo ni perder la foto ya tomada — ver
                confirmAndProcess. z-[60] para quedar por encima del z-50 del
                propio LoaderStep. */}
            {generationRetry && !generationRetry.stalled && (
              <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6">
                <div className="rounded-full bg-black/70 text-white text-sm font-semibold px-5 py-2 backdrop-blur-sm">
                  Reconectando…
                </div>
              </div>
            )}

            {generationRetry?.stalled && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6">
                <div className="max-w-sm w-full rounded-2xl bg-white text-black p-6 flex flex-col items-center gap-4 text-center shadow-xl">
                  <p className="font-bold text-lg">Problemas de conexión</p>
                  <p className="text-sm text-black/70">
                    No pudimos conectar para generar tu imagen. Tu foto sigue
                    lista, solo intenta de nuevo.
                  </p>
                  <button
                    type="button"
                    onClick={retryGenerationNow}
                    className="w-full rounded-full bg-red-500 text-white font-bold py-3 active:scale-95 transition"
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="text-sm font-semibold text-black/50 underline"
                  >
                    Cancelar y tomar otra foto
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fondo full-screen. Va con su propio crossfade porque `bgUrl` depende
          del paso: sin esto el fondo cambiaba de golpe en el mismo frame en
          que arrancaba la transición del contenido, y el corte se notaba más
          que el propio cambio de vista. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={bgUrl || "no-bg"}
          className="fixed inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `url('${bgUrl}')` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          aria-hidden
        />
      </AnimatePresence>

      {/* HEADER: Logo superior — fijo, siempre visible. En "capture" no se
          renderiza: los logos viven dentro de CaptureStep, abajo a los
          costados del disparador, para dejar toda la parte de arriba
          despejada para la cámara. En "customize" tampoco: los dos logos
          (arriba y abajo) se muestran juntos arriba dentro de
          ImageCustomizeStep, para liberar espacio vertical y evitar scroll. */}
      <AnimatePresence initial={false}>
        {step !== "capture" && step !== "customize" && topLogoSrc && (
          <motion.div
            key="top-logo-bar"
            className="relative z-5 flex-shrink-0 flex justify-center items-center px-4"
            style={{
              paddingTop: `max(${LOGO_BAR_PADDING}, env(safe-area-inset-top))`,
              paddingBottom: LOGO_BAR_PADDING,
            }}
            variants={LOGO_BAR_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <img
              src={topLogoSrc}
              alt="Logo"
              className="block w-auto object-contain select-none"
              style={scaledLogoStyle({
                baseHeight: LOGO_BAR_HEIGHT,
                baseMaxWidth: LOGO_BAR_TOP_MAX_WIDTH,
                scalePct: logoTopScalePct,
              })}
              draggable={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTENT: Contenedor del contenido (capture, preview, result) */}
      <div className="relative z-20 flex-1 flex items-center justify-center overflow-hidden px-0 sm:px-4 w-full">
        {/* w-full h-full (sin variante sm:auto): un hijo con altura en % (h-full,
            flex-1, etc. — como usan PreviewStep/ResultStep/ImageCustomizeStep
            para centrarse o hacer scroll interno) necesita que ESTE contenedor
            tenga una altura definida. "sm:h-auto" (shrink-to-content en
            pantallas >=640px) rompe eso: la altura pasa a depender del
            contenido, que a su vez depende de esta altura — termina en un
            tamaño ambiguo que o bien colapsa o bien se desborda y lo recorta
            el overflow-hidden + justify-center de acá abajo (tapando mitad
            arriba, mitad abajo). Cada paso ya centra su propio contenido
            internamente, así que h-full fijo no cambia cómo se ve. */}
        {/* `relative`: los pasos se apilan con `absolute inset-0` para poder
            cruzarse en opacidad (ver stepVariants) en vez de turnarse. */}
        <div
          className="relative flex flex-col items-center justify-center overflow-hidden w-full h-full"
          style={{ width: "100%", maxWidth: boxSize, maxHeight: "100%" }}
        >
          <AnimatePresence initial={false}>
            {step === "preview" && framedShot && (
              <motion.div
                key="preview"
                className="absolute inset-0 flex items-center justify-center"
                variants={stepVariantsFor("preview", reduceMotion)}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <PreviewStep
                  framedShot={framedShot}
                  rawShot={rawShot || undefined}
                  boxSize={boxSize}
                  borderRadius={borderRadius}
                  onRetake={resetAll}
                  onConfirm={handlePreviewConfirm}
                  buttonImage={eventData?.buttonImage}
                  buttonColorFrom={eventData?.splashButtonColorFrom}
                  buttonColorTo={eventData?.splashButtonColorTo}
                  buttonClickEffect={eventData?.buttonClickEffect}
                  aspectRatio={eventData?.photoAspectRatio}
                />
              </motion.div>
            )}

            {step === "customize" && framedShot && (
              <motion.div
                key="customize"
                className="absolute inset-0 flex items-center justify-center"
                variants={stepVariantsFor("customize", reduceMotion)}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <ImageCustomizeStep
                  previewSrc={rawShot || framedShot}
                  buttonImage={eventData?.buttonImage}
                  buttonColorFrom={eventData?.splashButtonColorFrom}
                  buttonColorTo={eventData?.splashButtonColorTo}
                  buttonClickEffect={eventData?.buttonClickEffect}
                  logoLeftSrc={style?.logoLandingTop}
                  logoRightSrc={style?.logoLandingBottom}
                  logoLeftScalePct={logoTopScalePct}
                  logoRightScalePct={logoBottomScalePct}
                  onConfirm={handleCustomizeConfirmed}
                  aspectRatio={eventData?.photoAspectRatio}
                />
              </motion.div>
            )}

            {step === "reveal" && framedShot && aiUrl && (
              <motion.div
                key="reveal"
                className="absolute inset-0 flex items-center justify-center"
                variants={stepVariantsFor("reveal", reduceMotion)}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {eventData?.revealEffect === "KINECT_ROLLER" ? (
                  <>
                    <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
                      <p className="text-white text-xl sm:text-2xl font-semibold drop-shadow-sm">
                        Revelando tu foto en la pantalla grande…
                      </p>
                      <p className="text-white/70 text-base max-w-sm">
                        Usa el rodillo real para descubrirla ahí. Cuando termines, esta pantalla continúa sola.
                      </p>
                    </div>
                    {/* Botón invisible de rescate: si el revelado con Kinect
                        no llega a reportar "listo" (falla de red, backend
                        caído, etc.), el operador puede tocar acá para forzar
                        el avance a "result" sin esperar a remoteRevealedTaskId. */}
                    <button
                      type="button"
                      onClick={() => setStep("result")}
                      aria-label="Revelar manualmente"
                      className="absolute bottom-0 right-0 w-20 h-20 opacity-0"
                    />
                  </>
                ) : (eventData?.revealEffect ?? "HAND_WIPE") === "HAND_WIPE" && eventData?.mirrorScreenEnabled !== false ? (
                  <>
                    <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
                      <p className="text-white text-xl sm:text-2xl font-semibold drop-shadow-sm">
                        Revelando tu foto en la pantalla grande…
                      </p>
                      <p className="text-white/70 text-base max-w-sm">
                        Mueve tu mano frente a la cámara de la pantalla grande para descubrirla ahí. Cuando termines, esta pantalla continúa sola.
                      </p>
                    </div>
                    {/* Mismo rescate invisible que KINECT_ROLLER (ver arriba),
                        por si la pantalla espejo nunca reporta revealedTaskId. */}
                    <button
                      type="button"
                      onClick={() => setStep("result")}
                      aria-label="Revelar manualmente"
                      className="absolute bottom-0 right-0 w-20 h-20 opacity-0"
                    />
                  </>
                ) : eventData?.revealEffect === "ROLLER" || eventData?.revealEffect === "ROLLER_COLOR" ? (
                  <RollerRevealStep
                    aiUrl={aiUrl}
                    videoUrl={aiVideoUrl ?? undefined}
                    frameSrc={eventData?.frameImage ?? style?.frameImage ?? null}
                    enableFrame={eventData?.enableFrame ?? style?.enableFrame ?? true}
                    revealColorHint={color}
                    veilMode={eventData?.revealEffect === "ROLLER_COLOR" ? "GRAYSCALE_PHOTO" : "SOLID"}
                    paintTimeSeconds={eventData?.paintTimeSeconds}
                    aspectRatio={eventData?.photoAspectRatio}
                    onRevealed={() => setStep("result")}
                  />
                ) : (
                  <RevealStep
                    aiUrl={aiUrl}
                    videoUrl={aiVideoUrl ?? undefined}
                    frameSrc={eventData?.frameImage ?? style?.frameImage ?? null}
                    enableFrame={eventData?.enableFrame ?? style?.enableFrame ?? true}
                    revealColorHint={color}
                    handTrackingEnabled={eventData?.handRevealEnabled === true}
                    paintTimeSeconds={eventData?.paintTimeSeconds}
                    aspectRatio={eventData?.photoAspectRatio}
                    onRevealed={() => setStep("result")}
                  />
                )}
              </motion.div>
            )}

            {step === "result" && framedShot && aiUrl && (
              <motion.div
                key="result"
                className="absolute inset-0 flex items-center justify-center"
                variants={stepVariantsFor("result", reduceMotion)}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <ResultStep
                  taskId={taskId!}
                  aiUrl={aiUrl}
                  videoUrl={aiVideoUrl ?? undefined}
                  onAgain={resetAll}
                  buttonImage={eventData?.buttonImage}
                  buttonClickEffect={eventData?.buttonClickEffect}
                  showQr={showQr}
                  onShowQrChange={setShowQr}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* FOOTER: Logo inferior — fijo, siempre visible. En "capture" no se
          renderiza: el logo va dentro de CaptureStep, al costado del
          disparador. En "customize" tampoco: ver nota del HEADER arriba. */}
      <AnimatePresence initial={false}>
        {step !== "capture" && step !== "customize" && bottomLogoSrc && (
          <motion.div
            key="bottom-logo-bar"
            className="relative z-5 flex-shrink-0 flex justify-center items-center px-4 pointer-events-none"
            style={{
              paddingTop: LOGO_BAR_PADDING,
              paddingBottom: `max(${LOGO_BAR_PADDING}, env(safe-area-inset-bottom))`,
            }}
            variants={LOGO_BAR_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <img
              src={bottomLogoSrc}
              alt="Logos Footer"
              /* `pointer-events-auto` sobre la imagen (la barra sigue siendo
                 pointer-events-none): es el botón oculto que abre el
                 salvapantallas al mantenerlo presionado — ver ScreenSaver. */
              className="block w-auto object-contain select-none pointer-events-auto"
              style={scaledLogoStyle({
                baseHeight: LOGO_BAR_HEIGHT,
                baseMaxWidth: LOGO_BAR_BOTTOM_MAX_WIDTH,
                scalePct: logoBottomScalePct,
              })}
              draggable={false}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
