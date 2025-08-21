/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useRef, useState } from "react";
import CameraView, { FrameBox } from "@/app/components/CameraView";
import ResultView from "@/app/components/ResultView";
import PreviewView from "@/app/components/PreviewView";
import LoadingView from "@/app/components/LoadingView";

// ⬇️ IMPORTA tus helpers de Firebase (ajusta la ruta si es necesario)
import { db, uploadDataUrlAndGetURL } from "@/firebaseConfig";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

/** Rectángulo del HUECO del PNG, en % (ajústalo a tu marco) */
const FRAME_BOX: FrameBox = { xPct: 12.5, yPct: 20, wPct: 75, hPct: 62 };

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const unsubRef = useRef<null | (() => void)>(null);

  const [rawPhoto, setRawPhoto] = useState<string | null>(null);   // hueco crudo (input IA)
  const [framedPhoto, setFramedPhoto] = useState<string | null>(null); // ORIGINAL + marco
  const [aiPhoto, setAiPhoto] = useState<string | null>(null);     // salida IA (sin marco)
  const [photo, setPhoto] = useState<string | null>(null);         // para preview (mostramos el con marco)
  const [step, setStep] = useState<"camera" | "preview" | "loading" | "result">("camera");

  // Limpia cualquier suscripción al desmontar la página
  useEffect(() => () => { unsubRef.current?.(); unsubRef.current = null; }, []);

  // Enciende cámara cuando estamos en la vista de cámara
  useEffect(() => {
    if (step !== "camera") return;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.muted = true;
        v.setAttribute("playsinline", "");
        try { await v.play(); } catch {}
      } catch (e) {
        console.error("No se pudo abrir la cámara", e);
        alert("No se pudo abrir la cámara. Revisa permisos.");
      }
    })();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [step]);

  // Utilidad: cargar imagen
  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  const takePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // 1) Marco y tamaño base del lienzo
    const frame = await loadImage("/images/marco.png");
    const W = frame.naturalWidth || 1080;
    const H = frame.naturalHeight || 1080;

    // 2) Hueco en px a partir de % (coinciden con CameraView)
    const x = Math.round((FRAME_BOX.xPct / 100) * W);
    const y = Math.round((FRAME_BOX.yPct / 100) * H);
    const w = Math.round((FRAME_BOX.wPct / 100) * W);
    const h = Math.round((FRAME_BOX.hPct / 100) * H);

    // 3) Recorte tipo "object-cover" para llenar el hueco sin deformar
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.max(w / vw, h / vh);
    const sw = Math.round(w / scale);
    const sh = Math.round(h / scale);
    const sx = Math.round((vw - sw) / 2);
    const sy = Math.round((vh - sh) / 2);

    // 4) RAW (solo hueco) — input de IA
    const cRaw = document.createElement("canvas");
    cRaw.width = w;
    cRaw.height = h;
    const ctxR = cRaw.getContext("2d")!;
    ctxR.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    const raw = cRaw.toDataURL("image/png");

    // 5) FRAMED (video en hueco + marco encima) — ORIGINAL + marco
    const cFr = document.createElement("canvas");
    cFr.width = W;
    cFr.height = H;
    const ctxF = cFr.getContext("2d")!;
    ctxF.drawImage(video, sx, sy, sw, sh, x, y, w, h);
    ctxF.drawImage(frame, 0, 0, W, H);
    const framed = cFr.toDataURL("image/png");

    setRawPhoto(raw);
    setFramedPhoto(framed);
    setAiPhoto(null);      // limpiar IA previa
    setPhoto(framed);      // en preview mostramos el con marco
    setStep("preview");
  };

  function makeTaskId() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  }

  const processPhoto = async (): Promise<void> => {
    if (!rawPhoto) return;

    // 1) Apagar cámara
    const stream = (videoRef.current?.srcObject as MediaStream | null) || null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;

    setStep("loading");

    try {
      // 2) Generar id y path en Storage
      const taskId = makeTaskId();
      const inputPath = `tasks/${taskId}/input.png`;

      // 3) Sube el dataURL a Storage (helper tuyo)
      await uploadDataUrlAndGetURL(inputPath, rawPhoto);

      // 4) Crear el doc en Firestore → dispara la Cloud Function
      const taskRef = doc(db, "imageTasks", taskId);
      await setDoc(taskRef, {
        status: "queued",
        inputPath,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 5) Suscribirse a cambios (tiempo real, sin polling)
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = onSnapshot(taskRef, (snap) => {
        const d = snap.data() as any;
        if (!d) return;

        if (d.status === "done" && d.url) {
          unsubRef.current?.();
          unsubRef.current = null;
          setAiPhoto(d.url);
          setPhoto(d.url);
          setStep("result");
        } else if (d.status === "error") {
          unsubRef.current?.();
          unsubRef.current = null;
          console.error("Tarea falló:", d.error || d.details);
          alert("Falló la generación. Intenta de nuevo.");
          setStep("camera");
        }
        // queued/processing → seguimos mostrando LoadingView
      });
    } catch (err) {
      console.error("Error iniciando la tarea:", err);
      alert("Ocurrió un error iniciando la generación.");
      setStep("camera");
    }
  };

  const download = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div className="min-h-[100svh] w-full grid place-items-center p-4">
      {step === "camera" && (
        <CameraView
          videoRef={videoRef}
          frameSrc="/images/marco.png"
          frameBox={FRAME_BOX}
          onCapture={takePhoto}
        />
      )}

      {step === "preview" && photo && (
        <PreviewView
          photo={photo}
          onDiscard={() => {
            setPhoto(null);
            setStep("camera");
          }}
          onProcess={processPhoto}
        />
      )}

      {step === "loading" && <LoadingView />}

      {step === "result" && (aiPhoto || rawPhoto) && framedPhoto && (
        <ResultView
          rawPhoto={aiPhoto || rawPhoto} // ← IA en “Sin marco”
          framedPhoto={framedPhoto}      // ← ORIGINAL con marco
          onDownloadRaw={() =>
            download((aiPhoto || rawPhoto)!, "foto_sin_marco.png")
          }
          onDownloadFramed={() => download(framedPhoto, "foto_con_marco.png")}
          onRestart={() => {
            unsubRef.current?.();
            unsubRef.current = null;
            setRawPhoto(null);
            setFramedPhoto(null);
            setAiPhoto(null);
            setPhoto(null);
            setStep("camera");
          }}
        />
      )}
    </div>
  );
}
