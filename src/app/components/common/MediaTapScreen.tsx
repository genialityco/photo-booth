/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useCallback } from "react";

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
  children,
}: {
  imageUrl?: string;
  /** Tiene prioridad sobre imageUrl si ambos están presentes. */
  videoUrl?: string;
  onTap: () => void;
  className?: string;
  /** Overlay opcional encima del media (ej. SplashScreen superpone su barra
   * de progreso + botón como "pie" cuando el fondo es un video). Se renderiza
   * después de las capas de media, así que queda arriba en el stacking sin
   * necesitar z-index; debe traer su propio posicionamiento (`absolute`). */
  children?: React.ReactNode;
}) {
  const hasMedia = !!(videoUrl || imageUrl);

  // Algunos navegadores (sobre todo iOS/Android más viejos, o WebViews de
  // hardware de kiosco) evalúan si pueden autoreproducir en base al atributo
  // `muted` presente apenas se crea el <video> — pero React setea `muted`
  // como propiedad de JS un instante después de montar el nodo, no como
  // atributo HTML, así que a veces esa primera evaluación llega "sin mute" y
  // el navegador bloquea el autoplay antes de que React lo alcance a mutear.
  // Forzarlo acá, en el momento exacto en que el nodo se crea (ref callback,
  // no useEffect), y reintentar play() explícitamente cubre esos casos —
  // .play() ya en curso por el atributo `autoPlay` simplemente no hace nada.
  const autoplayVideoRef = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    video.muted = true;

    // En mobile, el primer .play() a veces se dispara antes de que el
    // navegador tenga metadata/datos suficientes para decodificar (sobre
    // todo con red lenta), y ahí la promesa se rechaza sin reintentarse
    // sola. Se reintenta al cargar metadata, al quedar listo para
    // reproducir, y al volver la pestaña a primer plano.
    const tryPlay = () => {
      video.play().catch(() => {
        // Autoplay bloqueado igual (política del navegador — p. ej. Modo de
        // Bajo Consumo de iOS bloquea el autoplay de video aunque esté
        // muted, sin alternativa por JS): queda pausado en el primer frame.
        // El botón nativo de "play" que iOS dibuja encima se oculta por CSS
        // (ver .media-tap-video en globals.css); el tap en pantalla (onTap)
        // ya cubre seguir de largo.
      });
    };
    tryPlay();
    video.addEventListener("loadedmetadata", tryPlay);
    video.addEventListener("canplay", tryPlay);
    document.addEventListener("visibilitychange", tryPlay);

    return () => {
      video.removeEventListener("loadedmetadata", tryPlay);
      video.removeEventListener("canplay", tryPlay);
      document.removeEventListener("visibilitychange", tryPlay);
    };
  }, []);

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
            ref={autoplayVideoRef}
            src={videoUrl}
            className="media-tap-video absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-75 select-none"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
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
          ref={autoplayVideoRef}
          src={videoUrl}
          className="media-tap-video relative w-full h-full object-contain select-none"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
      ) : (
        <img
          src={imageUrl || "/images/placeholder.png"}
          alt=""
          className="relative w-full h-full object-contain select-none"
          draggable={false}
        />
      )}

      {children}
    </div>
  );
}
