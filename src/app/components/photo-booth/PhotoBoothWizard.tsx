/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import EventPhotoBoothLanding from "@/app/components/photo-booth/EventPhotoBoothLanding";
import CaptureStep from "@/app/components/photo-booth/CaptureStep";
import PreviewStep from "@/app/components/photo-booth/PreviewStep";
import LoaderStep from "@/app/components/photo-booth/LoaderStep";
import RevealStep from "@/app/components/photo-booth/RevealStep";
import RollerRevealStep from "@/app/components/photo-booth/reveal/RollerRevealStep";
import { ROLLER_MODEL_PATH } from "@/app/components/photo-booth/reveal/RollerCursor";
import ResultStep from "@/app/components/photo-booth/ResultStep";
import ImageCustomizeStep, { type ImageCustomization } from "@/app/components/photo-booth/ImageCustomizeStep";
import { getStyleProfileById } from "@/app/services/admin/styleService";
import type { StyleProfile } from "@/app/services/admin/styleService";
import {
  getEventProfileBySlug,
  type EventProfile,
} from "@/app/services/photo-booth/eventService";
import { getPhotoBoothPromptById } from "@/app/services/photo-booth/brandService";
import { useSearchParams } from "next/navigation";
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

export default function PhotoBoothWizard({
  mirror = true,
  // Caja cuadrada responsiva: mínimo 320px, escala con viewport
  boxSize = "min(80vw, 80vh)",
  borderRadius = "4xl",
  eventData,
  onReset,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  borderRadius?: "none" | "md" | "lg" | "xl" | "4xl";
  eventData?: EventProfile;
  onReset?: () => void;
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
  const [taskId, setTaskId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [customization, setCustomization] = useState<ImageCustomization | null>(null);
  const unsubRef = useRef<() => void | undefined>(undefined);
  const [style, setStyle] = useState<StyleProfile | null>(null);

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

  // Precarga el modelo 3D del rodillo lo antes posible (apenas se sabe que el
  // evento usa este efecto), así llega descargado/en caché del navegador
  // mucho antes de que termine la generación y se necesite en RevealStep.
  useEffect(() => {
    const usesRoller = eventData?.revealEffect === "ROLLER" || eventData?.revealEffect === "ROLLER_COLOR";
    if (!usesRoller) return;
    if (typeof document === "undefined") return;
    if (document.querySelector(`link[href="${ROLLER_MODEL_PATH}"]`)) return;

    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "fetch";
    link.href = ROLLER_MODEL_PATH;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }, [eventData?.revealEffect]);

  const handleCaptured = (payload: { framed: string; raw: string }) => {
    setFramedShot(payload.framed);
    setRawShot(payload.raw);
    setStep("preview");
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

  const confirmAndProcess = async (customizationOverride?: ImageCustomization) => {
    if (!framedShot) return;
    // El estado `customization` puede no haberse actualizado todavía cuando
    // se llama justo después de setCustomization (batching de React), así
    // que se acepta el valor fresco como override.
    const finalCustomization = customizationOverride ?? customization;
    setStep("loading");
    try {
      const newTaskId = `t_${Math.random()
        .toString(36)
        .slice(2, 10)}_${Date.now().toString(36)}`;
      setTaskId(newTaskId);

      // 1) Subir la FOTO CON MARCO como input via /api/storage/upload
      const uploadResponse = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: framedShot,
          desiredPath: `tasks/${newTaskId}/input.png`,
        }),
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error ||
            `Upload failed with status ${uploadResponse.status}`,
        );
      }

      const uploadData = await uploadResponse.json();
      const framedDownloadUrl = uploadData.url;
      const inputPath = uploadData.path;

      setFramedUrl(framedDownloadUrl);

      // 2) Crear doc en Firestore - El trigger processImageTask lo procesará
      const taskRef = doc(collection(db, "imageTasks"), newTaskId);

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

      await setDoc(taskRef, {
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
        taskId: newTaskId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3) Suscripción hasta "done"
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = undefined;
      }
      unsubRef.current = onSnapshot(taskRef, async (snap) => {
        const data = snap.data();
        if (!data) return;

        if (data.status === "error") {
          console.error("Task error:", data?.error || "unknown");
          setStep("preview");
          return;
        }

        if (data.status === "done" && data.url) {
          console.log(
            "[PhotoBoothWizard] Task completed with result URL:",
            data.url,
          );
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
      });
    } catch (e) {
      console.error("[PhotoBoothWizard] Error in confirmAndProcess:", e);
      alert(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
      setStep("preview");
    }
  };

  const resetAll = () => {
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
    setTaskId(null);
    setCustomization(null);
    setStep("capture");
  };

  const stepVariants = {
    initial: { opacity: 0, y: 16, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -16, scale: 0.98 },
  };
  const stepTransition = { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const };

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
      {/* Paso "filter" (captura primero): pantalla completa propia (fondo,
          logos, grilla de marcas y consentimiento), igual que la landing
          normal pero mostrada después del preview en vez de antes de la
          captura. Cubre todo el wizard mientras está activa. */}
      {step === "filter" && eventData && (
        <div className="fixed inset-0 z-40">
          <EventPhotoBoothLanding
            event={eventData}
            onStart={handleFilterSelected}
            buttonLabel="Generar la magia"
          />
        </div>
      )}

      {/* Paso "capture": cámara a pantalla completa. Se renderiza fuera del
          AnimatePresence animado de abajo a propósito — un motion.div con
          transform activo (lo que usan las demás transiciones de paso)
          crea un "containing block" para posición fixed, y CaptureStep
          necesita que su `fixed inset-0` interno apunte al viewport real,
          no al box de contenido acotado por `boxSize`. */}
      {step === "capture" && (
        <CaptureStep
          mirror={mirror}
          onCaptured={handleCaptured}
          frameSrc={eventData?.frameImage ?? style?.frameImage ?? null}
          buttonImage={eventData?.buttonImage}
          buttonClickEffect={eventData?.buttonClickEffect}
          viewStyle={eventData?.captureViewStyle}
          logoLeftSrc={style ? style.logoCaptureTop || style.logoLandingTop : "/genilaty_smart_led_logo.png"}
          logoRightSrc={style ? style.logoCaptureBottom || style.logoLandingBottom : "genilaty_smart_led_logo.png"}
          backgroundSrc={bgUrl}
        />
      )}

      {/* Fondo full-screen */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `url('${bgUrl}')` }}
        aria-hidden
      />

      {/* HEADER: Logo superior — fijo, siempre visible. En "capture" no se
          renderiza: los logos viven dentro de CaptureStep, abajo a los
          costados del disparador, para dejar toda la parte de arriba
          despejada para la cámara. En "customize" tampoco: los dos logos
          (arriba y abajo) se muestran juntos arriba dentro de
          ImageCustomizeStep, para liberar espacio vertical y evitar scroll. */}
      {step !== "capture" && step !== "customize" && (
        <div className="relative z-5 flex-shrink-0 flex justify-center items-center pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="w-[50vw] max-w-[260px]">
            <img
              src={
                style
                  ? step === "loading"
                    ? style.logoLoadingTop || style.logoLandingTop
                    : step === "result" || step === "reveal"
                      ? style.logoResultsTop || style.logoLandingTop
                      : style.logoLandingTop
                  : "/genilaty_smart_led_logo.png"
              }
              alt="Logo"
              className="w-full select-none"
              draggable={false}
            />
          </div>
        </div>
      )}

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
        <div
          className="flex flex-col items-center justify-center overflow-hidden w-full h-full"
          style={{ width: "100%", maxWidth: boxSize, maxHeight: "100%" }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {step === "preview" && framedShot && (
              <motion.div
                key="preview"
                className="relative w-full h-full flex items-center justify-center"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
              >
                <PreviewStep
                  framedShot={framedShot}
                  rawShot={rawShot || undefined}
                  boxSize={boxSize}
                  borderRadius={borderRadius}
                  onRetake={resetAll}
                  onConfirm={handlePreviewConfirm}
                  buttonImage={eventData?.buttonImage}
                  buttonClickEffect={eventData?.buttonClickEffect}
                />
              </motion.div>
            )}

            {step === "customize" && framedShot && (
              <motion.div
                key="customize"
                className="relative w-full h-full flex items-center justify-center"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
              >
                <ImageCustomizeStep
                  previewSrc={rawShot || framedShot}
                  buttonImage={eventData?.buttonImage}
                  buttonClickEffect={eventData?.buttonClickEffect}
                  logoLeftSrc={style?.logoLandingTop}
                  logoRightSrc={style?.logoLandingBottom}
                  onConfirm={handleCustomizeConfirmed}
                />
              </motion.div>
            )}

            {step === "loading" && (
              <motion.div
                key="loading"
                className="relative w-full h-full"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
              >
                <div className="absolute inset-0 z-50">
                  <LoaderStep />
                </div>
              </motion.div>
            )}

            {step === "reveal" && framedShot && aiUrl && (
              <motion.div
                key="reveal"
                className="relative w-full h-full flex items-center justify-center"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
              >
                {eventData?.revealEffect === "ROLLER" || eventData?.revealEffect === "ROLLER_COLOR" ? (
                  <RollerRevealStep
                    aiUrl={aiUrl}
                    videoUrl={aiVideoUrl ?? undefined}
                    frameSrc={eventData?.frameImage ?? style?.frameImage ?? null}
                    enableFrame={eventData?.enableFrame ?? style?.enableFrame ?? true}
                    revealColorHint={color}
                    veilMode={eventData?.revealEffect === "ROLLER_COLOR" ? "GRAYSCALE_PHOTO" : "SOLID"}
                    handTrackingEnabled={eventData?.handRevealEnabled === true}
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
                    onRevealed={() => setStep("result")}
                  />
                )}
              </motion.div>
            )}

            {step === "result" && framedShot && aiUrl && (
              <motion.div
                key="result"
                className="relative w-full h-full flex items-center justify-center"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
              >
                <ResultStep
                  taskId={taskId!}
                  aiUrl={aiUrl}
                  videoUrl={aiVideoUrl ?? undefined}
                  onAgain={resetAll}
                  buttonImage={eventData?.buttonImage}
                  buttonClickEffect={eventData?.buttonClickEffect}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* FOOTER: Logo inferior — fijo, siempre visible. En "capture" no se
          renderiza: el logo va dentro de CaptureStep, al costado del
          disparador. En "customize" tampoco: ver nota del HEADER arriba. */}
      {step !== "capture" && step !== "customize" && (
        <div className="relative z-5 flex-shrink-0 flex justify-center items-center pb-[max(env(safe-area-inset-bottom),2rem)] pointer-events-none">
          <div className="w-[50vw] max-w-[380px]">
            <img
              src={
                style
                  ? step === "loading"
                    ? style.logoLoadingBottom || style.logoLandingBottom
                    : step === "result" || step === "reveal"
                      ? style.logoResultsBottom || style.logoLandingBottom
                      : style.logoLandingBottom
                  : "genilaty_smart_led_logo.png"
              }
              alt="Logos Footer"
              className="w-full select-none"
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
