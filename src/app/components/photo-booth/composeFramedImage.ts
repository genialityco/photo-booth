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

/** Dibuja un logo de auspiciante en la esquina superior izquierda —
 * ver EventProfile.brandingLogoUrl. Tamaño proporcional al canvas,
 * preservando la relación de aspecto original del logo. */
async function drawBrandingLogo(ctx: CanvasRenderingContext2D, src: string, w: number) {
  const logoImg = await loadImage(src);
  const lw0 = logoImg.naturalWidth || logoImg.width;
  const lh0 = logoImg.naturalHeight || logoImg.height;
  if (!lw0 || !lh0) return;

  const margin = w * 0.04;
  const maxLogoW = w * 0.22;
  const logoScale = Math.min(1, maxLogoW / lw0);
  ctx.drawImage(logoImg, margin, margin, lw0 * logoScale, lh0 * logoScale);
}

/** Dibuja texto centrado (multilínea con "\n") pegado al borde inferior,
 * sobre una barra semi-transparente para que se lea sobre cualquier fondo —
 * ver EventProfile.brandingFooterText. */
function drawBrandingFooterText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return;

  const fontSize = Math.round(h * 0.026);
  const lineHeight = Math.round(fontSize * 1.35);
  const paddingV = Math.round(fontSize * 0.6);
  const barHeight = lines.length * lineHeight + paddingV * 2;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, h - barHeight, w, barHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let y = h - barHeight + paddingV + lineHeight / 2;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += lineHeight;
  }
  ctx.restore();
}

export async function composeFramedCanvas({
  aiUrl,
  frameSrc,
  enableFrame,
  size = 1024,
  width,
  height,
  brandingLogoSrc,
  brandingFooterText,
}: {
  aiUrl: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  /** Compatibilidad: si no se pasan width/height, el canvas es size x size (cuadrado). */
  size?: number;
  width?: number;
  height?: number;
  /** Logo de auspiciante, esquina superior izquierda — ver EventProfile.brandingLogoUrl. */
  brandingLogoSrc?: string | null;
  /** Texto (multilínea con "\n") centrado abajo — ver EventProfile.brandingFooterText. */
  brandingFooterText?: string | null;
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

  if (brandingLogoSrc) {
    await drawBrandingLogo(ctx, brandingLogoSrc, w);
  }

  if (brandingFooterText) {
    drawBrandingFooterText(ctx, brandingFooterText, w, h);
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
  brandingLogoSrc?: string | null;
  brandingFooterText?: string | null;
}): Promise<string> {
  const canvas = await composeFramedCanvas(opts);
  return canvas.toDataURL("image/png");
}
