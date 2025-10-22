/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import CaptureStep from "./CaptureStep";
import PreviewStep from "./PreviewStep";
import LoaderStep from "./LoaderStep";
import ResultStep from "./ResultStep";
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

  useEffect(() => {
    if (!searchParams) {
      setBrand("default");
      setColor(null);
    } else {
      setBrand((searchParams.get("brand") as string) || "default");
      setColor((searchParams.get("color") as string) || null);
    }
    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const data = snap.data() as any;
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

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Fondo full-screen */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('/fenalco/capture/FONDO_HABILITAR-CAMARA_EMB_MARCA.jpg')",
        }}
        aria-hidden
      />

      {/* Logo superior — responsivo por breakpoint */}
      <div
        className={`
          absolute z-10 left-1/2 -translate-x-1/2
          top-[max(1.5rem,env(safe-area-inset-top))]
          w-[70vw] max-w-[380px]
        `}
      >
        <img
          src="/fenalco/capture/TITULO_80-ANIOS.png"
          alt="80 años Fenalco"
          className="w-full select-none"
          draggable={false}
        />
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
              /* frameSrc={frameSrc} */
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
            <ResultStep
              taskId={taskId!}
              aiUrl={aiUrl}
              onAgain={resetAll}
            />
          )}
        </div>
      </div>

      {/* Footer fijo con safe-area */}
      <div
        className="
          pointer-events-none absolute inset-x-0 z-10 mx-auto

        "
        style={{ bottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <img
          src="/fenalco/capture/LOGOS_BLANCO_UNA-LINEA.png"
          alt="Logos Footer"
          className="w-full select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
