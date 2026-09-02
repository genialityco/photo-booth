// Composita video + marco (tamaño del canvas = tamaño nativo del marco usado)
import { fitWithin } from "@/app/components/photo-booth/imageResize";

export default function captureWithFrame({
  video,
  frame,
  targetW,
  targetH,
  mirror,
  maxSide = 0,
  quality = 0.9,
}: {
  video: HTMLVideoElement;
  frame: HTMLImageElement | null;
  targetW: number;
  targetH: number;
  mirror: boolean;
  /** Lado largo máximo del resultado. 0 = sin tope (tamaño nativo del marco,
   * el comportamiento normal). El modo ahorro de datos lo baja a 1080 para
   * que el POST de la subida pese un tercio — ver lowBandwidthMode.ts. */
  maxSide?: number;
  /** Calidad JPEG. */
  quality?: number;
}) {
  const { width: outW, height: outH } = fitWithin(targetW, targetH, maxSide);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const videoAspect = vw / vh;
  const targetAspect = outW / outH;

  let sx = 0,
    sy = 0,
    sWidth = vw,
    sHeight = vh;

  // recorte para simular object-cover
  if (videoAspect > targetAspect) {
    const newWidth = vh * targetAspect;
    sx = (vw - newWidth) / 2;
    sWidth = newWidth;
  } else {
    const newHeight = vw / targetAspect;
    sy = (vh - newHeight) / 2;
    sHeight = newHeight;
  }

  if (mirror) {
    ctx.save();
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
    ctx.restore();
  } else {
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
  }

  if (frame) ctx.drawImage(frame, 0, 0, outW, outH);
  // JPEG en vez de PNG sin comprimir: en conexiones lentas (varios eventos
  // en sitios con wifi débil) un PNG de varios MB en un solo POST era lo que
  // hacía que la subida se cayera durante la generación. Calidad 0.9 es
  // visualmente indistinguible para una foto y pesa una fracción del PNG.
  return canvas.toDataURL("image/jpeg", quality);
}
