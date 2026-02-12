/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import CaptureStep from "@/app/components/photo-booth/CaptureStep";
import PreviewStep from "@/app/components/photo-booth/PreviewStep";
import LoaderStep from "@/app/components/photo-booth/LoaderStep";
import ResultStep from "@/app/components/photo-booth/ResultStep";
import { getStyleProfileById } from "@/app/services/admin/styleService";
import type { StyleProfile } from "@/app/services/admin/styleService";
import { getEventProfileBySlug, type EventProfile } from "@/app/services/photo-booth/eventService";
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

export default function PhotoBoothWizard({
  mirror = true,
  // Caja cuadrada responsiva: mínimo 320px, escala con viewport, máximo 820px
  boxSize = "clamp(320px, min(72vmin, 78svh), 820px)",
  eventData,
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  eventData?: EventProfile;
}) {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<
    "capture" | "preview" | "loading" | "result"
  >("capture");
  const [framedShot, setFramedShot] = useState<string | null>(null);
  const [, setRawShot] = useState<string | null>(null);
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [framedUrl, setFramedUrl] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const unsubRef = useRef<() => void | undefined>(undefined);

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
          console.log("[PhotoBoothWizard] Using eventData as style:", eventData.name);
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
          sessionStorage.setItem("photoBoothStyle", JSON.stringify(eventAsStyle));
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
            console.log("[PhotoBoothWizard] derived styleId from pathname:", styleId);
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
            console.log("[PhotoBoothWizard] found cached data in sessionStorage:", parsed?.id || parsed?.slug);
            // If there's no explicit styleId OR cached matches requested styleId, use cached
            if (!styleId || parsed?.id === styleId) {
              setStyle(parsed);
              return;
            }
            console.log("[PhotoBoothWizard] cached style id differs from requested styleId, fetching requested style");
          }
        } catch (e) {
          console.warn("[PhotoBoothWizard] error reading sessionStorage", e);
        }

        if (!styleId) {
          console.log("[PhotoBoothWizard] no styleId found in search or pathname and no cached style");
          return;
        }

        const s = await getStyleProfileById(styleId);
        setStyle(s);
        console.log("[PhotoBoothWizard] loaded style object:", s);
        try {
          console.log("[PhotoBoothWizard] loaded style JSON:\n", JSON.stringify(s, null, 2));
        } catch (e) {
          console.log("[PhotoBoothWizard] could not stringify style", e);
        }
      } catch (err) {
      }
    };
    loadStyle();
  }, []);
  const handleCaptured = (payload: { framed: string; raw: string }) => {
    setFramedShot(payload.framed);
    setRawShot(payload.raw);
    setStep("preview");
  };

  const confirmAndProcess = async () => {
    if (!framedShot) return;
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
        const errorData = await uploadResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Upload failed with status ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      const framedDownloadUrl = uploadData.url;
      const inputPath = uploadData.path;

      setFramedUrl(framedDownloadUrl);

      // 2) Crear doc en Firestore - El trigger processImageTask lo procesará
      const taskRef = doc(collection(db, "imageTasks"), newTaskId);

      // Usar el brand/color del estado si existen, si no del sessionStorage
      const promptId = brand || sessionStorage.getItem("selectedBrand") || eventData?.prompts?.[0] || null;
      const finalColor = color || sessionStorage.getItem("selectedColor") || null;

      // Resolver el brand field a partir del promptId (la Cloud Function busca por 'brand')
      let finalBrand = "default";
      if (promptId) {
        try {
          const prompt = await getPhotoBoothPromptById(promptId);
          if (prompt) {
            // Usar el campo 'brand' que es lo que la Cloud Function busca
            finalBrand = prompt.brand || promptId;
            console.log("[PhotoBoothWizard] Resolved brand field:", { promptId, finalBrand, prompt });
          } else {
            finalBrand = promptId; // Usar el ID como fallback
            console.warn("[PhotoBoothWizard] Prompt not found, using ID:", promptId);
          }
        } catch (error) {
          console.error("[PhotoBoothWizard] Error resolving prompt:", error);
          finalBrand = promptId || "default";
        }
      }


      console.log("[PhotoBoothWizard] Final brand and color:", { finalBrand, finalColor });

      await setDoc(taskRef, {
        status: "queued",
        inputPath,
        framedPath: inputPath,
        framedUrl: framedDownloadUrl,
        brand: finalBrand,
        color: finalColor,
        prompt: finalBrand, // También enviar como 'prompt' para compatibilidad con Cloud Function
        promptId: promptId, // Guardar el ID también para referencia
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
        const data = snap.data() as any;
        if (!data) return;

        if (data.status === "error") {
          console.error("Task error:", data?.error || "unknown");
          setStep("preview");
          return;
        }

        if (data.status === "done" && data.url) {
          console.log("[PhotoBoothWizard] Task completed with result URL:", data.url);
          setAiUrl(data.url as string);
          setStep("result");
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
    setFramedShot(null);
    setRawShot(null);
    setAiUrl(null);
    setFramedUrl(null);
    setTaskId(null);
    setStep("capture");

    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Fondo full-screen */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: "url('Lenovo/app-avatars-01.png')",
        }}
        aria-hidden
      />

      {/* Logo superior — responsivo por breakpoint */}
      <div
        className={`
    absolute z-10 left-1/2 -translate-x-1/2
    top-[max(1.5rem,env(safe-area-inset-top))]
    w-[70vw] max-w-[380px]
    flex flex-col items-center gap-2
  `}
      >
        <img
          src="/Lenovo/app-avatars-02.png"
          alt="Logo Gen.iality"
          className="w-full select-none"
          draggable={false}
        />

        {/* ← NUEVO: título debajo del logo */}
        {/* <img
          src="/Colombia4.0/TITULO.png"
          alt="Título Gen.iality"
          className="w-full select-none mt-10"
          draggable={false}
        /> */}
      </div>

      {/* Contenido centrado */}
      <div className="relative z-10 grid h-full w-full place-items-center">
        <div
          className="flex items-center justify-center overflow-visible"
          style={{ width: boxSize, height: boxSize }}
        >
          {step === "capture" && (
            <CaptureStep
              mirror={mirror}
              boxSize={boxSize}
              onCaptured={handleCaptured}
              frameSrc={eventData?.frameImage ?? style?.frameImage ?? null}
              buttonImage={eventData?.buttonImage}
            />
          )}

          {step === "preview" && framedShot && (
            <PreviewStep
              framedShot={framedShot}
              boxSize={boxSize}
              onRetake={resetAll}
              onConfirm={confirmAndProcess}
              buttonImage={eventData?.buttonImage}
            />
          )}

          {step === "loading" && <LoaderStep />}

          {step === "result" && framedShot && aiUrl && (
            <ResultStep taskId={taskId!} aiUrl={aiUrl} onAgain={resetAll} buttonImage={eventData?.buttonImage} />
          )}
        </div>
      </div>

      {/* Footer fijo con safe-area */}
      <div
        className="
          pointer-events-none absolute inset-x-0 z-1 mx-auto

        "
        style={{ bottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <img
          src="/Lenovo/app-avatars-04.png" //"/congresoEdu/Logo-congreso-v2.png"
          alt="Logos Footer"
          className="w-full select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
