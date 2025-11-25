/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import CaptureStep from "./CaptureStep";
import PreviewStep from "./PreviewStep";
import LoaderStep from "./LoaderStep";
import ResultStep from "./ResultStep";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import { useSearchParams } from "next/navigation";
import { db } from "@/firebaseConfig";
import { getBrandConfig } from "./landing";
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
  boxSize = "clamp(320px, min(72vmin, 78svh), 820px)",
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
}) {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<
    "init" | "capture" | "preview" | "loading" | "result"
  >("init");
  const [framedShot, setFramedShot] = useState<string | null>(null);
  const [, setRawShot] = useState<string | null>(null);
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [framedUrl, setFramedUrl] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const unsubRef = useRef<() => void | undefined>(undefined);

  useEffect(() => {
    // Esperar a que searchParams esté disponible
    if (searchParams) {
      const brandParam = searchParams.get("brand");
      const colorParam = searchParams.get("color");
      
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

      const inputPath = `tasks/${newTaskId}/input.png`;
      const inputRef = ref(storage, inputPath);
      await uploadString(inputRef, framedShot, "data_url", {
        contentType: "image/png",
      });

      const framedDownloadUrl = await getDownloadURL(inputRef);
      setFramedUrl(framedDownloadUrl);

      const taskRef = doc(collection(db, "videoTasks"), newTaskId);
      await setDoc(taskRef, {
        status: "queued",
        inputPath,
        framedPath: inputPath,
        framedUrl: framedDownloadUrl,
        brand: brand,
        color,
        taskId: newTaskId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

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
    setStep("init");

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
          backgroundImage: "url('suRed/home/FONDO_UNIENDO-AL-MUNDO_HOME.jpg')",
        }}
        aria-hidden
      />

      {/* Logo superior */}
      <div
        className={`
          absolute z-10 left-1/2 -translate-x-1/2
          
          w-[80vw] max-w-[580px]
        `}
      >
        <img
          src="/suRed/home/TITULO-UNIENDO-AL-MUNDO.png"
          alt="UNIENDO AL MUNDO"
          className=" mx-auto w-full max-w-[620px] select-none"
          draggable={false}
        />
      </div>

      {/* Contenido centrado */}
      <div className="relative z-10 grid h-full w-full place-items-center">
        <div
          className="flex items-center justify-center overflow-visible"
          style={{ width: boxSize, height: boxSize }}
        >
          {step === "init" && (
            <div className="flex flex-col items-center justify-center gap-8">
              {/* Tarjeta seleccionada */}
              {brand && getBrandConfig(brand) && (
                <div className="rounded-2xl bg-white p-6 shadow-2xl">
                  <img
                    src={getBrandConfig(brand)!.logo}
                    alt={getBrandConfig(brand)!.aria}
                    className="h-auto w-64 select-none object-contain"
                    draggable={false}
                    style={{
                      paddingLeft:
                        brand === "macpollo" || brand === "colombina"
                          ? "20px"
                          : "0",
                      paddingRight:
                        brand === "macpollo" || brand === "colombina"
                          ? "20px"
                          : "0",
                    }}
                  />
                </div>
              )}
              <ButtonPrimary
                {...{ onClick: () => setStep("capture") }}
                label="HABILITAR CAMARA"
                imageSrc="/suRed/home/BOTON.png"
              />
            </div>
          )}

          {step === "capture" && (
            <CaptureStep
              mirror={mirror}
              boxSize={boxSize}
              onCaptured={handleCaptured}
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
    pointer-events-none absolute inset-x-0 z-10 mx-auto
    origin-bottom scale-75 sm:scale-50 md:scale-75
  "
        style={{
          bottom: "max(env(safe-area-inset-bottom),40px)",
          width: 960,
          maxWidth: "90vw",
        }}
      >
        <img
          src="/suRed/home/LOGOS-JUNTOS.png"
          alt="Logos Footer"
          className="w-full select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}