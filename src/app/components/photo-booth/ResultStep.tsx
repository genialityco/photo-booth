/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import type { ButtonClickEffectId } from "@/app/components/common/click-effects";
import QrTag from "@/app/components/photo-booth/QrTag";
import { composeFramedCanvas, composeFramedImageDataUrl } from "@/app/components/photo-booth/composeFramedImage";
import { getPixelDims } from "@/app/components/photo-booth/photoAspectRatio";
import { useFitAspectBox } from "@/app/components/photo-booth/useFitAspectBox";

type Props = {
  taskId: string;
  aiUrl: string;
  videoUrl?: string;
  onAgain: () => void;
  footer?: React.ReactNode;
  buttonImage?: string;
  buttonClickEffect?: ButtonClickEffectId;
  /** Controlado por el padre (PhotoBoothWizard) en vez de estado local, para
   * poder transmitirlo a la pantalla espejo (BoothMirror) — ver
   * useBoothLiveSession. */
  showQr: boolean;
  onShowQrChange: (value: boolean) => void;
};

export default function ResultStep({
  taskId,
  aiUrl,
  videoUrl,
  onAgain,
  buttonImage,
  buttonClickEffect,
  showQr,
  onShowQrChange,
}: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const reduceMotion = useReducedMotion();
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [qrSize, setQrSize] = useState(500);
  const enableFrame = event?.enableFrame ?? style?.enableFrame ?? true;
  const frameSrc = event?.frameImage ?? null;
  // Logo de auspiciante + texto de contacto "quemados" en la foto resultante
  // (composeFramedImage.ts) — a diferencia de frameSrc, no dependen de
  // enableFrame: son branding del evento, independiente del marco decorativo.
  const brandingLogoSrc = event?.brandingLogoUrl ?? null;
  const brandingFooterText = event?.brandingFooterText ?? null;
  const aspectRatio = event?.photoAspectRatio;
  const pixelDims = useMemo(() => getPixelDims(aspectRatio), [aspectRatio]);
  // Mide el contenedor real y encoge la foto para que todo (foto + botones)
  // quepa sin scroll, en vez del "scroll de emergencia" que había antes —
  // mismo mecanismo que PreviewStep, importante ahora que la relación de
  // aspecto es configurable por evento (3:4 ocupa más alto que el cuadrado
  // original).
  const { containerRef, boxDims } = useFitAspectBox(aspectRatio);

  const surveyAI = useMemo(() => {
    const url = new URL(`${origin}/survey`);
    
    if (videoUrl) {
      url.searchParams.set("src", videoUrl);
      url.searchParams.set("kind", "video");
      url.searchParams.set("filename", `video-ia-${taskId}.mp4`);
    } else {
      url.searchParams.set("src", aiUrl);
      url.searchParams.set("kind", "raw");
      url.searchParams.set("filename", `foto-ia-${taskId}.png`);
      
      // Agregar frameUrl solo si enableFrame está activado y hay frameImage
      if (enableFrame && frameSrc) {
        url.searchParams.set("frameUrl", frameSrc);
      }
    }
    
    return url.toString();
  }, [origin, aiUrl, videoUrl, taskId, enableFrame, frameSrc]);

  // === Componer imagen con marco (para preview en pantalla) ===
  const [framedImageUrl, setFramedImageUrl] = useState<string>("");

  useEffect(() => {
    if (!aiUrl) return;

    const composeFrame = async () => {
      try {
        // Si no hay marco NI branding, mostrar la imagen tal cual (evita el
        // round-trip a canvas cuando no hace falta componer nada).
        if ((!enableFrame || !frameSrc) && !brandingLogoSrc && !brandingFooterText) {
          setFramedImageUrl(aiUrl);
          return;
        }

        const dataUrl = await composeFramedImageDataUrl({
          aiUrl,
          frameSrc,
          enableFrame,
          brandingLogoSrc,
          brandingFooterText,
          width: pixelDims.width,
          height: pixelDims.height,
        });
        setFramedImageUrl(dataUrl);
      } catch (err) {
        console.error("Error composing frame:", err);
        setFramedImageUrl(aiUrl); // Fallback a imagen sin marco
      }
    };

    composeFrame();
  }, [aiUrl, frameSrc, enableFrame, brandingLogoSrc, brandingFooterText, pixelDims.width, pixelDims.height]);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("photoBoothStyle");
      if (cached) {
        const parsed = JSON.parse(cached);
        setStyle(parsed);
        console.log("[ResultStep] loaded cached style:", parsed?.id || parsed);
      }

      const cachedEvent = sessionStorage.getItem("currentEvent");
      if (cachedEvent) {
        const parsedEvent = JSON.parse(cachedEvent);
        setEvent(parsedEvent);
        console.log(
          "[ResultStep] loaded cached event:",
          parsedEvent?.slug || parsedEvent?.id,
        );
      }
    } catch (e) {
      console.warn("[ResultStep] error reading sessionStorage", e);
    }
  }, []);

  // Calcular tamaño del QR expandido (ocupa toda la caja de la foto al
  // tocarlo) — acotado también por el alto de pantalla, para no desbordar en
  // pantallas bajas y anchas.
  useEffect(() => {
    const updateQrSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const size = Math.min(Math.max(280, vw * 0.38), vh * 0.36, 480);
      setQrSize(size);
    };

    updateQrSize();
    window.addEventListener("resize", updateQrSize);
    return () => window.removeEventListener("resize", updateQrSize);
  }, []);

  // === Descargar imagen o video ===
  const handleDownload = async () => {
    // Si hay video, descargarlo directamente
    if (videoUrl) {
      // Usar proxy para forzar "Content-Disposition: attachment" en iOS/Safari
      const downloadApiUrl = `/api/storage/download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(`video-ia-${taskId}.mp4`)}`;
      const a = document.createElement("a");
      a.href = downloadApiUrl;
      a.download = `video-ia-${taskId}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    try {
      const canvas = await composeFramedCanvas({
        aiUrl,
        frameSrc,
        enableFrame,
        brandingLogoSrc,
        brandingFooterText,
        width: pixelDims.width,
        height: pixelDims.height,
      });

      // Exportar como blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("No se pudo generar la imagen final");

      // Descargar
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foto-ia-${taskId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando la descarga:", err);
      alert("No se pudo generar la imagen con el marco. Inténtalo nuevamente.");
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden"
    >
      {/* Sin scroll: la foto encoge (useFitAspectBox) para que foto + botones
          quepan siempre en el alto disponible, incluso con relaciones de
          aspecto más altas que el cuadrado original (3:4). */}
      <main className="flex-1 min-h-0 w-full flex flex-col items-center gap-2 sm:gap-3 py-2 sm:py-4">
        {/* Imagen/Video IA, con el QR como sello en la esquina — tocarlo lo
            agranda a toda la caja (mismo lugar, sin salto de layout). Mat +
            sombra en capas, mismo tratamiento que el resto del wizard. */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 w-full flex items-center justify-center p-5 sm:p-8"
          style={{ perspective: "1200px" }}
        >
          {/* El padding de este contenedor es lo que le deja aire al bloom y al
              recorrido del flote. `boxDims` sale del `contentRect` del
              ResizeObserver, que NO incluye el padding, así que la foto se
              achica sola para dejar ese margen: sin eso el halo se cortaría
              contra el borde de la caja del wizard, que va con
              overflow-hidden, y el corte duro se ve peor que no tener halo.
              Subir el padding = más halo y más recorrido, foto más chica. */}
          <div
            className="relative"
            style={
              boxDims
                ? { width: boxDims.width, height: boxDims.height }
                : { maxWidth: "100%", maxHeight: "100%" }
            }
          >
            {/* BLOOM en dos capas, las dos hechas con la propia foto ampliada y
                desenfocada. Al salir de la imagen misma, el halo toma sus
                colores y cambia con cada foto sin tener que calcular nada.

                Van FUERA del wrapper que flota, a propósito: quedándose
                quietas mientras la tarjeta se mueve por encima se genera un
                paralaje (la foto se despega del halo) que es lo que vende la
                sensación de que está suspendida. Si el halo se moviera con la
                tarjeta parecería pegado y el efecto se pierde.

                Se usa siempre la imagen (`aiUrl`) incluso en los eventos con
                video: es el mismo contenido y evita dos <video> más
                decodificando en paralelo, que en las tablets del kiosco se
                nota. El blur es caro pero se pinta una vez y queda cacheado
                como textura; lo que se anima encima es opacity/scale, que el
                compositor resuelve en GPU. Si en el hardware del evento se
                viera con tirones, lo primero que hay que sacar es el `scale`
                de la capa ancha (el blur se re-rasteriza al escalar en algunos
                navegadores) — con solo la opacidad el efecto se sostiene. */}
            <motion.img
              aria-hidden
              src={framedImageUrl || aiUrl}
              alt=""
              draggable={false}
              className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover rounded-[3rem] blur-3xl saturate-[2] brightness-110"
              animate={
                reduceMotion
                  ? { opacity: 0.7, scale: 1.2 }
                  : { opacity: [0.6, 0.85, 0.6], scale: [1.16, 1.26, 1.16] }
              }
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.img
              aria-hidden
              src={framedImageUrl || aiUrl}
              alt=""
              draggable={false}
              className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover rounded-[2rem] blur-2xl saturate-[1.8]"
              animate={reduceMotion ? { opacity: 0.6 } : { opacity: [0.5, 0.78, 0.5] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Sombra de apoyo: acompaña la deriva horizontal de la tarjeta y
                va en contrafase con el flote (se encoge y se aclara cuando la
                foto sube). Es lo que hace leer el movimiento como "flota" y no
                como "se desplaza"; sin ella el mismo recorrido parece un
                glitch de layout. Se posiciona con `left-[12.5%]` en vez de
                `left-1/2 -translate-x-1/2` porque framer escribe el `transform`
                completo del elemento y pisaría la utilidad de Tailwind. */}
            {!reduceMotion && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute left-[12.5%] -bottom-4 h-3 w-3/4 rounded-[50%] bg-black/55 blur-md"
                animate={{
                  scaleX: [1, 0.82, 0.92, 0.8, 1],
                  opacity: [0.6, 0.24, 0.42, 0.2, 0.6],
                  x: [0, 7, -5, 4, 0],
                }}
                transition={{
                  scaleX: { duration: 9, repeat: Infinity, ease: "easeInOut" },
                  opacity: { duration: 9, repeat: Infinity, ease: "easeInOut" },
                  x: { duration: 11, repeat: Infinity, ease: "easeInOut" },
                }}
              />
            )}

            {/* Flote "dinámico": en vez de un sube-y-baja, cada eje tiene su
                propia duración y son números primos entre sí (7/9/11/13/15/17).
                El patrón compuesto tarda muchísimo en repetirse, así que a la
                vista nunca se lee como un loop — es la diferencia entre "la
                foto está animada" y "la foto flota". Todo es transform puro
                (+ la `perspective` del contenedor para que rotateX/rotateY den
                profundidad real), o sea que se compone en GPU sin repintar. */}
            <motion.div
              className="relative z-10 w-full h-full"
              animate={
                reduceMotion
                  ? undefined
                  : {
                      y: [0, -14, -6, -16, 0],
                      x: [0, 7, -5, 4, 0],
                      rotateZ: [0, 0.7, -0.6, 0.4, 0],
                      rotateY: [0, 2.2, -1.8, 1.2, 0],
                      rotateX: [0, -1.4, 1.2, -0.8, 0],
                      scale: [1, 1.015, 1.005, 1.02, 1],
                    }
              }
              transition={{
                y: { duration: 9, repeat: Infinity, ease: "easeInOut" },
                x: { duration: 11, repeat: Infinity, ease: "easeInOut" },
                rotateZ: { duration: 13, repeat: Infinity, ease: "easeInOut" },
                rotateY: { duration: 15, repeat: Infinity, ease: "easeInOut" },
                rotateX: { duration: 17, repeat: Infinity, ease: "easeInOut" },
                scale: { duration: 7, repeat: Infinity, ease: "easeInOut" },
              }}
            >
              <div
                className="relative w-full h-full p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 rounded-2xl shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)]"
              >
                <div className="relative w-full h-full overflow-hidden rounded-xl bg-black/5">
                  {videoUrl ? (
                    <video
                      src={videoUrl}
                      className="absolute inset-0 w-full h-full object-contain"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={framedImageUrl || aiUrl}
                      alt="Imagen generada por IA"
                      className="absolute inset-0 w-full h-full object-contain select-none"
                      draggable={false}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => onShowQrChange(!showQr)}
                    aria-label={showQr ? "Volver a la foto" : "Mostrar código QR para descargar la foto"}
                    className={`absolute rounded-xl transition-all duration-300 ease-out ${
                      showQr
                        ? "inset-0 bg-white flex flex-col items-center justify-center gap-2 p-4"
                        : "bottom-2 right-2 sm:bottom-3 sm:right-3 bg-white p-1.5 sm:p-2 shadow-lg ring-1 ring-black/10 active:scale-95"
                    }`}
                  >
                    <QrTag
                      value={surveyAI}
                      size={showQr ? qrSize : Math.max(48, Math.min(88, (boxDims?.width ?? 240) * 0.22))}
                      label={showQr ? "Escanea para descargar tu foto en tu celular" : undefined}
                    />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Botones: nueva foto / descargar */}
        <div className="flex-shrink-0 w-full flex flex-row items-center justify-center gap-2 sm:gap-3 overflow-x-auto whitespace-nowrap">
          <ButtonPrimary
            onClick={onAgain}
            label="NUEVA FOTO"
            imageSrc={buttonImage}
            colorFrom={event?.splashButtonColorFrom}
            colorTo={event?.splashButtonColorTo}
            width="clamp(96px, 30vw, 310px)"
            height="clamp(40px, 8vh, 60px)"
            className="flex-1 basis-0 min-w-0 max-w-[310px]"
            clickEffect={buttonClickEffect}
          />
          <ButtonPrimary
            onClick={handleDownload}
            label="DESCARGAR"
            imageSrc={buttonImage}
            colorFrom={event?.splashButtonColorFrom}
            colorTo={event?.splashButtonColorTo}
            width="clamp(96px, 30vw, 310px)"
            height="clamp(40px, 8vh, 60px)"
            className="flex-1 basis-0 min-w-0 max-w-[310px]"
            clickEffect={buttonClickEffect}
          />
        </div>
      </main>
    </div>
  );
}