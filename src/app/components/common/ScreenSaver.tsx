"use client";

import React, { useEffect, useState, useCallback } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import ScreenSaverSlideshow from "@/app/components/common/ScreenSaverSlideshow";

/**
 * Shell del salvapantallas: detecta inactividad y muestra el overlay a
 * pantalla completa (con animación de entrada/salida) cuando corresponde. El
 * contenido en sí (loop de media → splash → galería → filtros) lo arma
 * ScreenSaverSlideshow — ver ese componente para el detalle de cada slide.
 */
export default function ScreenSaver({ event }: { event: EventProfile }) {
  const timeoutMs = (event.screenSaverInactivityTimeoutSec ?? 150) * 1000;

  // Candidatos sincrónicos, derivados solo de `event` — alcanza para decidir
  // si vale la pena activar el overlay. La elegibilidad real de la galería
  // (que depende de una suscripción en vivo a Firestore) se resuelve dentro
  // de ScreenSaverSlideshow; acá su toggle solo cuenta como candidato
  // optimista, sin esperar a saber si ya hay fotos.
  const hasMedia =
    !!(event.screenSaverVideoUrl || event.splashImage) &&
    event.screenSaverMediaSlideEnabled !== false;
  const hasSplash = event.screenSaverSplashSlideEnabled !== false;
  const hasGalleryCandidate = event.screenSaverGallerySlideEnabled !== false;
  const hasFilters =
    (event.prompts?.length ?? 0) >= 2 && event.screenSaverFiltersSlideEnabled !== false;
  const hasAnySlideCandidate = hasMedia || hasSplash || hasGalleryCandidate || hasFilters;

  const [isActive, setIsActive] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleActivity = useCallback(() => {
    if (isActive && !isExiting) {
      // Iniciar animación de salida
      setIsExiting(true);
      // Después de la animación, ocultar completamente
      setTimeout(() => {
        setIsActive(false);
        setIsExiting(false);
      }, 500); // Duración de la animación
    }
  }, [isActive, isExiting]);

  useEffect(() => {
    if (!hasAnySlideCandidate) return;

    // Eventos que indican actividad del usuario
    const domEvents = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];

    let timeoutId: NodeJS.Timeout;

    const handleUserActivity = () => {
      if (isActive) {
        handleActivity();
      } else {
        // Resetear el timer
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setIsActive(true);
        }, timeoutMs);
      }
    };

    // Agregar listeners
    domEvents.forEach((domEvent) => {
      window.addEventListener(domEvent, handleUserActivity);
    });

    // Iniciar el timer inicial
    timeoutId = setTimeout(() => {
      setIsActive(true);
    }, timeoutMs);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      domEvents.forEach((domEvent) => {
        window.removeEventListener(domEvent, handleUserActivity);
      });
    };
  }, [hasAnySlideCandidate, timeoutMs, isActive, handleActivity]);

  if (!hasAnySlideCandidate || !isActive) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black transition-transform duration-500 ease-in-out ${
        isExiting ? "translate-x-full" : "translate-x-0"
      }`}
    >
      <ScreenSaverSlideshow event={event} onExit={handleActivity} />
    </div>
  );
}
