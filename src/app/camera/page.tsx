/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useRef, useState } from "react";
import CameraView, { FrameBox } from "@/app/components/CameraView";
import ResultView from "@/app/components/ResultView";
import PreviewView from "@/app/components/PreviewView";
import LoadingView from "@/app/components/LoadingView";

/** Rectángulo del HUECO del PNG, en % (ajústalo a tu marco) */
const FRAME_BOX: FrameBox = { xPct: 12.5, yPct: 20, wPct: 75, hPct: 62 };

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [rawPhoto, setRawPhoto] = useState<string | null>(null); // hueco crudo (input IA)
  const [framedPhoto, setFramedPhoto] = useState<string | null>(null); // ORIGINAL + marco
  const [aiPhoto, setAiPhoto] = useState<string | null>(null); // salida IA (sin marco)
  const [photo, setPhoto] = useState<string | null>(null); // para preview (mostramos el con marco)
  const [step, setStep] = useState<"camera" | "preview" | "loading" | "result">(
    "camera"
  );

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
        try {
          await v.play();
        } catch {}
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
    setAiPhoto(null); // limpiar IA previa
    setPhoto(framed); // en preview mostramos el con marco
    setStep("preview");
  };

const processPhoto = async () => {
  if (!rawPhoto) return;

  // Apagar cámara
  const stream = (videoRef.current?.srcObject as MediaStream) || null;
  stream?.getTracks().forEach((t) => t.stop());
  if (videoRef.current) videoRef.current.srcObject = null;

  setStep("loading");

  try {
    // ⬇️ Enviar como multipart/form-data (no JSON)
    const fd = new FormData();
    // Opción 1A (simple, sin convertir a Blob): manda el dataURL como texto
    fd.append("photoDataUrl", rawPhoto);

    // // Opción 1B (alternativa): si prefieres mandar Blob/archivo
    // const resBin = await fetch(rawPhoto);
    // const blob = await resBin.blob();
    // fd.append("photo", blob, "input.png");

    const res = await fetch("/api/generate", {
      method: "POST",
      body: fd, // 👈 sin Content-Type manual
    });

    // más robusto: lee texto y luego intenta parsear
    const text = await res.text();
    if (!res.ok) {
      console.error("Error de IA:", text);
      alert("No se pudo generar la imagen. Intenta de nuevo.");
      setStep("camera");
      return;
    }
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      console.error("Respuesta no JSON:", text);
      alert("Respuesta inválida del generador.");
      setStep("camera");
      return;
    }

    if (!data?.url) {
      console.error("Respuesta sin url:", data);
      alert("No se pudo generar la imagen. Intenta de nuevo.");
      setStep("camera");
      return;
    }

    setAiPhoto(data.url);
    setPhoto(data.url);
    setStep("result");
  } catch (err) {
    console.error("Error procesando la imagen:", err);
    alert("Ocurrió un error procesando la imagen.");
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
          framedPhoto={framedPhoto} // ← ORIGINAL con marco
          onDownloadRaw={() =>
            download((aiPhoto || rawPhoto)!, "foto_sin_marco.png")
          }
          onDownloadFramed={() => download(framedPhoto, "foto_con_marco.png")}
          onRestart={() => {
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
