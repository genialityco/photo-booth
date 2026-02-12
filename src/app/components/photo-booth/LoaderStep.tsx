"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";

export default function LoaderStep() {
  const [dots, setDots] = useState("");
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
      className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden text-white"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Fondo */}
      <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url('${bgUrl}')` }} aria-hidden />
      {/* Velo para legibilidad */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Logo superior (opcional - controlado por showLogos) */}
      {topLogo && (
        <div className="absolute inset-x-0 top-30 flex justify-center z-20">
          <img src={topLogo} alt="Logo Superior" width={520} height={96} className="drop-shadow-md select-none" draggable={false} />
        </div>
      )}

      {/* Contenido central */}
      <div className="relative z-20 flex h-full items-center justify-center px-6">
        <h1
          className="text-center text-4xl md:text-6xl font-semibold drop-shadow-lg tracking-tight"
          role="status"
          aria-live="polite"
        >
          {loadingMessage}{dots}
        </h1>
      </div>

      {/* Logo inferior (opcional - controlado por showLogos) */}
      {bottomLogo && (
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center">
          <img src={bottomLogo} alt="Aliados y patrocinadores" width={520} height={60} className="opacity-90 select-none" draggable={false} />
        </div>
      )}
    </div>
  );
}
