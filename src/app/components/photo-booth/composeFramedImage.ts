// Compone una imagen base (foto IA) + marco PNG opcional en un canvas cuadrado.
// Usado tanto por ResultStep (preview/descarga) como por RevealStep (imagen a revelar),
// para que ambas pantallas muestren exactamente el mismo resultado.

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
}: {
  aiUrl: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  size?: number;
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const baseImg = await loadImage(aiUrl);

  // Dibuja imagen base "cover" (centrada y recortada)
  const iw = baseImg.naturalWidth || baseImg.width;
  const ih = baseImg.naturalHeight || baseImg.height;
  const scale = Math.max(size / iw, size / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (size - dw) / 2;
  const dy = (size - dh) / 2;
  ctx.drawImage(baseImg, dx, dy, dw, dh);

  if (enableFrame && frameSrc) {
    const frameImg = await loadImage(frameSrc);
    ctx.drawImage(frameImg, 0, 0, size, size);
  }

  return canvas;
}

export async function composeFramedImageDataUrl(opts: {
  aiUrl: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  size?: number;
}): Promise<string> {
  const canvas = await composeFramedCanvas(opts);
  return canvas.toDataURL("image/png");
}
