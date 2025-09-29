/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import CaptureStep from "./CaptureStep";
import PreviewStep from "./PreviewStep";
import LoaderStep from "./LoaderStep";
import ResultStep from "./ResultStep";
import { useSearchParams } from "next/navigation"
import { db } from "@/firebaseConfig"; // ajusta si tu export es distinto
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
// import { json } from "stream/consumers";

export default function PhotoBoothWizard({
  frameSrc = null,
  mirror = true,
  boxSize = "min(88vw, 60svh)",
  
}: {
  frameSrc?: string | null;
  mirror?: boolean;
  boxSize?: string;
  
}) {
  const searchParams = useSearchParams()
  const [step, setStep] = useState<
    "capture" | "preview" | "loading" | "result"
  >("capture");
  const [framedShot, setFramedShot] = useState<string | null>(null); // dataURL (con marco) para mostrar
  const [, setRawShot] = useState<string | null>(null); // dataURL (sin marco) para la Function
  const [aiUrl, setAiUrl] = useState<string | null>(null); // URL devuelta por la Function
  const [framedUrl, setFramedUrl] = useState<string | null>(null); // URL generada al subir framed.png
  const [taskId, setTaskId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>("electronic");
  const [color, setColor] = useState<string | null>(null);
  const unsubRef = useRef<() => void | undefined>(undefined);


  useEffect(() => {
       if (!searchParams) {setBrand("default"); setColor(null)}
    else

    setBrand(searchParams.get("brand") as string || "default");
    setColor(searchParams.get("color") as string || null)
    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = undefined;
      }
    };
  }, []);

  const handleCaptured = (payload: { framed: string; raw: string }) => {
    setFramedShot(payload.framed);
    setRawShot(payload.raw);
    setStep("preview");
  };

  const confirmAndProcess = async () => {
    if (!framedShot) return; // <- ya no dependemos de rawShot
    setStep("loading");
    try {
      const storage = getStorage();
      const newTaskId = `t_${Math.random()
        .toString(36)
        .slice(2, 10)}_${Date.now().toString(36)}`;
      setTaskId(newTaskId);

      // 1) Subir la FOTO CON MARCO como input de la Function
      const inputPath = `tasks/${newTaskId}/input.png`;
      const inputRef = ref(storage, inputPath);
      await uploadString(inputRef, framedShot, "data_url", {
        contentType: "image/png",
      });

      // 2) Ese mismo input será tu "framed"
      const framedPath = inputPath;
      const framedDownloadUrl = await getDownloadURL(inputRef);
      setFramedUrl(framedDownloadUrl);

      // 3) Crear doc imageTasks/{taskId}
      const taskRef = doc(collection(db, "imageTasks"), newTaskId);
      console.log(brand)
      await setDoc(taskRef, {
        status: "queued",
        inputPath, // usado por la Function
        framedPath, // = inputPath
        framedUrl: framedDownloadUrl,
        brand,
        color,
        taskId: newTaskId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 4) Escuchar hasta done
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
  };

  return (
    <div
      className="h-[90svh] w-[100vw] flex items-center justify-center"
    >
      {step === "capture" && (
        <CaptureStep
          //frameSrc={frameSrc}
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
        <ResultStep
          taskId={taskId!}
          framedShotUrl={framedUrl!} // URL de Storage de la foto con marco
          aiUrl={aiUrl} // URL devuelta por la Function (ya en Storage)
          onAgain={resetAll}
        />
      )}
    </div>
  );
}
