/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";

/**
 * Pantalla a pantalla completa con imagen, gif o video de fondo; tocar en
 * cualquier parte dispara `onTap`. Sin texto ni botón superpuesto — el
 * estímulo para tocar (ej. "toca para continuar") debe venir del propio
 * diseño del archivo, no de HTML encima.
 *
 * El contenido real se muestra COMPLETO (object-contain, sin recortar),
 * porque el aspect ratio del archivo casi nunca coincide con el de cada
 * pantalla (celular vs. tablet vs. desktop). El espacio sobrante se rellena
 * con una segunda copia del mismo archivo, ampliada y difuminada de fondo
 * (mismo truco que Instagram/YouTube), en vez de dejar barras negras.
 *
 * La comparten SplashScreen (arranque del evento) y ScreenSaver (pantalla
 * de inactividad): cada uno le pasa su propio par imagen/video y controla
 * por fuera su posicionamiento, z-index y animación de entrada/salida.
 */
export default function MediaTapScreen({
  imageUrl,
  videoUrl,
  onTap,
  className = "",
}: {
  imageUrl?: string;
  /** Tiene prioridad sobre imageUrl si ambos están presentes. */
  videoUrl?: string;
  onTap: () => void;
  className?: string;
}) {
  const hasMedia = !!(videoUrl || imageUrl);

  return (
    <div
      onClick={onTap}
      role="button"
      aria-label="Continuar"
      className={`relative w-full h-full overflow-hidden bg-black cursor-pointer ${className}`}
    >
      {/* Fondo de relleno: mismo archivo, ampliado y difuminado, para que no
          queden barras vacías en los bordes que el contenido real no cubre. */}
      {hasMedia &&
        (videoUrl ? (
          <video
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-75 select-none"
            autoPlay
            loop
            muted
            playsInline
            aria-hidden
          />
        ) : (
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-75 select-none"
            draggable={false}
            aria-hidden
          />
        ))}

      {/* Contenido real: se ve completo, nunca se recorta. */}
      {videoUrl ? (
        <video
          src={videoUrl}
          className="relative w-full h-full object-contain select-none"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        <img
          src={imageUrl || "/images/placeholder.png"}
          alt=""
          className="relative w-full h-full object-contain select-none"
          draggable={false}
        />
      )}
    </div>
  );
}
