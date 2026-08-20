"use client";

import { useEffect, useRef, useState } from "react";
import { getAspectDims, type PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";

/**
 * Mide el contenedor real (ResizeObserver) y devuelve el ancho/alto en
 * píxeles del rectángulo más grande con la relación de aspecto dada que cabe
 * adentro — el mismo problema que resuelve `object-fit: contain` para
 * <img>/<video>, pero para un wrapper <div> (el "mat" con degradado/sombra
 * alrededor de la foto) que necesita coincidir exactamente con esa forma en
 * vez de quedar más grande y dejar franjas vacías, o desbordar y forzar
 * scroll cuando la relación de aspecto del evento cambia (ej. 3:4).
 */
export function useFitAspectBox(aspectRatio?: PhotoAspectRatio | null) {
  const { w: ratioW, h: ratioH } = getAspectDims(aspectRatio);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boxDims, setBoxDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      const containerRatio = width / height;
      const targetRatio = ratioW / ratioH;
      if (containerRatio > targetRatio) {
        setBoxDims({ width: height * targetRatio, height });
      } else {
        setBoxDims({ width, height: width / targetRatio });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratioW, ratioH]);

  return { containerRef, boxDims };
}
