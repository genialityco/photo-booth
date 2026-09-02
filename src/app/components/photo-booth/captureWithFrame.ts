// Composita video + marco (tamaño del canvas = tamaño nativo del PNG usado)
export default function captureWithFrame({
  video,
  frame,
  targetW,
  targetH,
  mirror,
}: {
  video: HTMLVideoElement;
  frame: HTMLImageElement | null;
  targetW: number;
  targetH: number;
  mirror: boolean;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const videoAspect = vw / vh;
  const targetAspect = targetW / targetH;

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
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
    ctx.restore();
  } else {
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
  }

  if (frame) ctx.drawImage(frame, 0, 0, targetW, targetH);
  // JPEG en vez de PNG sin comprimir: en conexiones lentas (varios eventos
  // en sitios con wifi débil) un PNG de varios MB en un solo POST era lo que
  // hacía que la subida se cayera durante la generación. Calidad 0.9 es
  // visualmente indistinguible para una foto y pesa una fracción del PNG.
  return canvas.toDataURL("image/jpeg", 0.9);
}
