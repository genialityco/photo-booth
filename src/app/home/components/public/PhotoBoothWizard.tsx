/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import CaptureStep from "./CaptureStep";
import PreviewStep from "./PreviewStep";
import LoaderStep from "./LoaderStep";
import ResultStep from "./ResultStep";
import { getStyleProfileById } from "@/app/services/styleService";
import type { StyleProfile } from "@/app/services/styleService";
import { useSearchParams } from "next/navigation";
import { db } from "@/firebaseConfig";
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
} from "firebase/storage";
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
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
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
  const [brand, setBrand] = useState<string | null>("electronic");
  const [color, setColor] = useState<string | null>(null);
  const unsubRef = useRef<() => void | undefined>(undefined);
  const [style, setStyle] = useState<StyleProfile | null>(null);

  useEffect(() => {
    // Esperar a que searchParams esté disponible
    if (searchParams) {
      const brandParam = searchParams.get("brand");
      const colorParam = searchParams.get("color");
      const styleIdParam = searchParams.get("styleId");
      console.log("StyleId param:", styleIdParam);
      console.log("Brand param:", brandParam);
      console.log("Color param:", colorParam);

      setBrand(brandParam || "default");
      setColor(colorParam || null);
    } else {
      // Fallback: leer directamente del window.location
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const brandParam = params.get("brand");
        const colorParam = params.get("color");

        console.log("Brand param (fallback):", brandParam);
        console.log("Color param (fallback):", colorParam);

        setBrand(brandParam || "default");
        setColor(colorParam || null);
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
        console.log(
          "[PhotoBoothWizard] loadStyle effect running",
          "search=",
          window.location.search,
          "pathname=",
          window.location.pathname
        );

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

        // Try sessionStorage first
        try {
          const cached = sessionStorage.getItem("photoBoothStyle");
          if (cached) {
            const parsed = JSON.parse(cached);
            console.log("[PhotoBoothWizard] found cached style in sessionStorage:", parsed?.id || parsed);
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
        console.error("Error loading style in wizard:", err);
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
      const storage = getStorage();
      const newTaskId = `t_${Math.random()
        .toString(36)
        .slice(2, 10)}_${Date.now().toString(36)}`;
      setTaskId(newTaskId);

      // 1) Subir la FOTO CON MARCO como input
      const inputPath = `tasks/${newTaskId}/input.png`;
      const inputRef = ref(storage, inputPath);
      await uploadString(inputRef, framedShot, "data_url", {
        contentType: "image/png",
      });

      // 2) URL pública (framed)
      const framedDownloadUrl = await getDownloadURL(inputRef);
      setFramedUrl(framedDownloadUrl);

      // 3) Crear doc en Firestore
      const taskRef = doc(collection(db, "imageTasks"), newTaskId);
      await setDoc(taskRef, {
        status: "queued",
        inputPath,
        framedPath: inputPath,
        framedUrl: framedDownloadUrl,
        brand,
        color,
        taskId: newTaskId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 4) Suscripción hasta "done"
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
      console.error(e);
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

  const bgUrl = style
    ? step === "capture"
      ? style.bgCapture || style.bgLanding
      : step === "loading"
      ? style.bgLoading || style.bgLanding
      : step === "result"
      ? style.bgResults || style.bgLanding
      : style.bgLanding
    : "/Lenovo/app-avatars-01.png";

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Fondo full-screen */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `url('${bgUrl}')` }}
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
          src={
            style
              ? (step === "capture"
                  ? style.logoCaptureTop || style.logoLandingTop
                  : step === "loading"
                  ? style.logoLoadingTop || style.logoLandingTop
                  : step === "result"
                  ? style.logoResultsTop || style.logoLandingTop
                  : style.logoLandingTop)
              : "/genilaty_smart_led_logo.png"
          }
          alt="Logo"
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
              frameSrc={style?.frameImage ?? null}
            />
          )}

          {step === "preview" && framedShot && (
            <PreviewStep
              framedShot={framedShot}
              boxSize={boxSize}
              onRetake={resetAll}
              onConfirm={confirmAndProcess}
            />
          )}

          {step === "loading" && <LoaderStep />}

          {step === "result" && framedShot && aiUrl && (
            <ResultStep taskId={taskId!} aiUrl={aiUrl} onAgain={resetAll} />
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
          src={
            style
              ? (step === "capture"
                  ? style.logoCaptureBottom || style.logoLandingBottom
                  : step === "loading"
                  ? style.logoLoadingBottom || style.logoLandingBottom
                  : step === "result"
                  ? style.logoResultsBottom || style.logoLandingBottom
                  : style.logoLandingBottom)
              : "genilaty_smart_led_logo.png"
          }
          alt="Logos Footer"
          className="w-full select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
