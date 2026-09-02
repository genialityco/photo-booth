/** Helpers de reescalado para las fotos que salen del booth hacia la red. */

/**
 * Acota un tamaño a un lado largo máximo, conservando la relación de aspecto.
 * `maxSide` en 0 (o mayor que el lado largo actual) devuelve el tamaño tal
 * cual: nunca agranda.
 */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!maxSide || maxSide <= 0 || longest <= maxSide) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Reescala un data URL a JPEG más chico. Se usa para la copia que ve la
 * pantalla espejo: esa imagen no se imprime ni se le pasa a la IA, solo se
 * muestra mientras el asistente confirma, así que subirla a resolución
 * completa duplicaba los bytes justo cuando el enlace tiene que sacar la foto
 * buena.
 *
 * Si algo falla (un data URL que el navegador no puede decodificar) devuelve
 * el original: perder la miniatura no debe romper la subida.
 */
export function downscaleDataUrl(
  dataUrl: string,
  maxSide: number,
  quality: number
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const { width, height } = fitWithin(
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          maxSide
        );
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
