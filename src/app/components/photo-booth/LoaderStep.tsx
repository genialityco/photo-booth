"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";

export default function LoaderStep() {
  const [dots, setDots] = useState("");
  const [progress, setProgress] = useState(0);
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [event, setEvent] = useState<EventProfile | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return; // evita animación si el usuario lo prefiere

    const id = setInterval(
      () => setDots((p) => (p.length < 3 ? p + "." : "")),
      500
    );
    return () => clearInterval(id);
  }, []);

  // Progreso simulado: sube gradualmente hasta 95% mientras se genera la imagen.
  // Gemini no reporta progreso real; al terminar, el wizard cambia de paso y
  // este componente se desmonta.
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95;
        const step = p < 60 ? 3 : p < 85 ? 2 : 1;
        return Math.min(95, p + step);
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      let data = sessionStorage.getItem("currentEvent");
      if (data) {
        const parsed = JSON.parse(data);
        setEvent(parsed);
        // Usar el evento como estilo si está disponible
        setStyle(parsed);
      } else {
        data = sessionStorage.getItem("photoBoothStyle");
        if (data) {
          const parsed = JSON.parse(data);
          setStyle(parsed);
        }
      }
    } catch (e) {
      // Error reading sessionStorage
    }
  }, []);

  // Priorizar loadingPageImage del evento, si no usar bgLoading, bgLanding, etc
  const bgUrl = event?.loadingPageImage 
    ? event.loadingPageImage
    : style 
    ? style.bgLoading || style.bgLanding || "/Lenovo/app-avatars-01.png" 
    : "/Lenovo/app-avatars-01.png";

  // Usar mensaje personalizado del evento si existe, si no "Generando imagen"
  const loadingMessage = event?.loadingMessage || "Generando imagen";

  // Estilo del mensaje configurable desde el admin
  const messageColor = event?.loadingMessageColor || undefined;
  const messageSize = event?.loadingMessageSize
    ? `${event.loadingMessageSize}px`
    : undefined;

  // Imagen del spinner (opcional). Si no hay, sólo se muestra el mensaje.
  const spinnerImage = event?.spinnerImage || null;

  // Controlar si mostrar logos basado en la configuración del evento
  const showLogos = event?.showLogosInLoader !== false && style !== null;
  
  // Si showLogos es true, usar los logos, si no comentarlos (pasando null o strings vacíos)
  const topLogo = showLogos 
    ? (event?.logoTop || style?.logoLoadingTop || style?.logoLandingTop || "genilaty_smart_led_logo.png")
    : null;
  
  const bottomLogo = showLogos
    ? (event?.logoBottom || style?.logoLoadingBottom || style?.logoLandingBottom || "genilaty_smart_led_logo.png")
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white"
    >
      {/* Fondo */}
      <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url('${bgUrl}')` }} aria-hidden />
      {/* Velo para legibilidad */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Contenido central */}
      <div className="relative z-20 flex flex-col items-center justify-center gap-6 px-3 sm:px-6">
        {/* Spinner (imagen configurable, proporcional y girando) */}
        {spinnerImage && (
          <img
            src={spinnerImage}
            alt="Cargando"
            className="w-24 h-24 sm:w-28 sm:h-28 object-contain animate-spin select-none"
            style={{ animationDuration: "1.2s" }}
            draggable={false}
          />
        )}

        <h1
          className="text-center text-2xl sm:text-3xl md:text-4xl font-semibold drop-shadow-lg tracking-tight"
          role="status"
          aria-live="polite"
          style={{ color: messageColor, fontSize: messageSize }}
        >
          {loadingMessage}{dots}
        </h1>

        {/* Contador de progreso simulado */}
        <div
          className="text-xl sm:text-2xl font-bold tabular-nums drop-shadow-lg"
          style={{ color: messageColor }}
          aria-hidden
        >
          {progress}%
        </div>
      </div>
    </div>
  );
}
