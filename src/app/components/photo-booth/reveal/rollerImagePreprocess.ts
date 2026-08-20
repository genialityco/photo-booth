// Preprocesamiento de imagen para mejorar la detección del rodillo real
// (modelo ONNX entrenado, ver rollerDetectionStore.ts). Se aplica sobre el
// frame ya reducido al tamaño de entrada del modelo (320x320), antes de
// convertirlo en el tensor — nunca sobre el video visible en pantalla.
// Portado 1:1 de C:\Users\sagp7\Documents\trainrodillo\webapp_demo.html
// (aplyDenoise/applyHistEq/applySharpen), la app de referencia para probar
// este modelo.
//
// Reducción de ruido: blur de caja 3x3 separable (horizontal + vertical),
// suaviza sensor noise sin destruir demasiado el contraste de bordes.
// Ecualización de histograma: sobre la luminancia (equivalente a
// cv2.equalizeHist, preserva el color), mejora el contraste con luz pareja
// o contraluz para que el rodillo se distinga mejor del fondo.
// Nitidez: unsharp mask 3x3 clásico, realza los bordes que el blur atenúa,
// para que el contorno del rodillo quede marcado para el detector.

function boxBlurPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, width: number, height: number, horizontal: boolean) {
  const dx = horizontal ? 1 : 0;
  const dy = horizontal ? 0 : 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const x0 = Math.max(0, x - dx);
      const y0 = Math.max(0, y - dy);
      const x1 = Math.min(width - 1, x + dx);
      const y1 = Math.min(height - 1, y + dy);
      const i0 = (y0 * width + x0) * 4;
      const i1 = (y * width + x) * 4;
      const i2 = (y1 * width + x1) * 4;
      for (let c = 0; c < 3; c++) {
        dst[i + c] = (src[i0 + c] + src[i1 + c] + src[i2 + c]) / 3;
      }
      dst[i + 3] = src[i + 3];
    }
  }
}

/** Reducción de ruido: blur de caja 3x3, aplicado en dos pasadas separables. */
export function applyDenoise(imageData: ImageData) {
  const { width, height, data } = imageData;
  const tmp = new Uint8ClampedArray(data.length);
  boxBlurPass(data, tmp, width, height, true);
  boxBlurPass(tmp, data, width, height, false);
}

/** Ecualización de histograma sobre la luminancia (preserva el color, aplicando el mismo desplazamiento a R/G/B). */
export function applyHistEq(imageData: ImageData) {
  const { data } = imageData;
  const n = data.length / 4;
  const hist = new Uint32Array(256);
  const lumas = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const y = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    lumas[i] = y;
    hist[y]++;
  }
  const cdf = new Uint32Array(256);
  let sum = 0;
  let cdfMin = 0;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    cdf[i] = sum;
    if (cdfMin === 0 && sum > 0) cdfMin = sum;
  }
  const denom = n - cdfMin || 1;
  const map = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    map[i] = Math.min(255, Math.max(0, Math.round((255 * (cdf[i] - cdfMin)) / denom)));
  }
  for (let i = 0; i < n; i++) {
    const delta = map[lumas[i]] - lumas[i];
    data[i * 4] = Math.min(255, Math.max(0, data[i * 4] + delta));
    data[i * 4 + 1] = Math.min(255, Math.max(0, data[i * 4 + 1] + delta));
    data[i * 4 + 2] = Math.min(255, Math.max(0, data[i * 4 + 2] + delta));
  }
}

const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0];

/** Nitidez: unsharp mask 3x3 clásico (realza bordes). */
export function applySharpen(imageData: ImageData) {
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const sy = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const sx = Math.min(width - 1, Math.max(0, x + kx));
            sum += src[(sy * width + sx) * 4 + c] * SHARPEN_KERNEL[k];
            k++;
          }
        }
        data[i + c] = sum;
      }
    }
  }
}
