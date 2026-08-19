// Compone una imagen base (foto IA) + marco PNG opcional en un canvas.
// Usado tanto por ResultStep (preview/descarga/impresión) como por RevealStep
// (imagen a revelar), para que ambas pantallas muestren exactamente el mismo
// resultado. El tamaño es configurable (por defecto cuadrado 1024x1024, el
// comportamiento original) para soportar relaciones de aspecto no cuadradas
// (ver photoAspectRatio.ts) — el recorte "cover" normaliza cualquier imagen
// de entrada al tamaño pedido, sin importar su forma original.

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // permite dibujar imágenes remotas
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export async function composeFramedCanvas({
  aiUrl,
  frameSrc,
  enableFrame,
  size = 1024,
  width,
  height,
}: {
  aiUrl: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  /** Compatibilidad: si no se pasan width/height, el canvas es size x size (cuadrado). */
  size?: number;
  width?: number;
  height?: number;
}): Promise<HTMLCanvasElement> {
  const w = width ?? size;
  const h = height ?? size;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const baseImg = await loadImage(aiUrl);

  // Dibuja imagen base "cover" (centrada y recortada)
  const iw = baseImg.naturalWidth || baseImg.width;
  const ih = baseImg.naturalHeight || baseImg.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(baseImg, dx, dy, dw, dh);

  if (enableFrame && frameSrc) {
    const frameImg = await loadImage(frameSrc);
    ctx.drawImage(frameImg, 0, 0, w, h);
  }

  return canvas;
}

export async function composeFramedImageDataUrl(opts: {
  aiUrl: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  size?: number;
  width?: number;
  height?: number;
}): Promise<string> {
  const canvas = await composeFramedCanvas(opts);
  return canvas.toDataURL("image/png");
}
