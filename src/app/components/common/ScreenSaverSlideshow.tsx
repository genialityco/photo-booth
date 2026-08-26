"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import SplashScreen from "@/app/components/photo-booth/SplashScreen";
import EventPhotoBoothLanding from "@/app/components/photo-booth/EventPhotoBoothLanding";
import MediaTapScreen from "@/app/components/common/MediaTapScreen";
import ScreenSaverGallery from "@/app/components/common/ScreenSaverGallery";

const NOOP = () => {};

type SlideType = "media" | "splash" | "gallery" | "filters";

/**
 * Rotador de pantallas del ScreenSaver: cicla media → splash → galería →
 * filtros mientras el booth está inactivo. Cada slide se renderiza dentro de
 * un wrapper `pointer-events-none`, así ningún handler interno de los
 * componentes reutilizados (ej. el botón de SplashScreen, que hace
 * `stopPropagation`) llega a dispararse — el ÚNICO elemento que escucha taps
 * es el contenedor raíz de acá, que siempre cierra el ScreenSaver.
 */
export default function ScreenSaverSlideshow({
  event,
  onExit,
}: {
  event: EventProfile;
  onExit: () => void;
}) {
  const [galleryHasPhotos, setGalleryHasPhotos] = useState(false);

  const mediaEligible =
    !!(event.screenSaverVideoUrl || event.splashImage) &&
    event.screenSaverMediaSlideEnabled !== false;
  const splashEligible = event.screenSaverSplashSlideEnabled !== false;
  const galleryEligible = event.screenSaverGallerySlideEnabled !== false && galleryHasPhotos;
  const filtersEligible =
    (event.prompts?.length ?? 0) >= 2 && event.screenSaverFiltersSlideEnabled !== false;

  const slides = useMemo<SlideType[]>(() => {
    const list: SlideType[] = [];
    if (mediaEligible) list.push("media");
    if (splashEligible) list.push("splash");
    if (galleryEligible) list.push("gallery");
    if (filtersEligible) list.push("filters");
    return list;
  }, [mediaEligible, splashEligible, galleryEligible, filtersEligible]);

  const [activeSlide, setActiveSlide] = useState<SlideType | null>(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  // Si cambia la lista de slides elegibles (ej. la galería recién consiguió
  // fotos, o un toggle la sacó de la rotación) y el slide activo ya no es
  // válido, saltar al primero disponible.
  useEffect(() => {
    if (slides.length === 0) {
      setActiveSlide(null);
      return;
    }
    setActiveSlide((current) => (current && slides.includes(current) ? current : slides[0]));
  }, [slides]);

  const slideDurationMs = (event.screenSaverSlideDurationSec ?? 10) * 1000;

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      setActiveSlide((current) => {
        const list = slidesRef.current;
        if (list.length === 0) return current;
        const idx = current ? list.indexOf(current) : -1;
        return list[(idx + 1) % list.length];
      });
    }, slideDurationMs);
    return () => clearInterval(id);
  }, [slides.length, slideDurationMs]);

  return (
    <div
      onClick={onExit}
      role="button"
      aria-label="Continuar"
      className="absolute inset-0 w-full h-full cursor-pointer"
    >
      {mediaEligible && activeSlide === "media" && (
        <div className="pointer-events-none absolute inset-0 animate-fadeIn">
          <MediaTapScreen imageUrl={event.splashImage} videoUrl={event.screenSaverVideoUrl} onTap={NOOP} />
        </div>
      )}

      {splashEligible && activeSlide === "splash" && (
        <div className="pointer-events-none absolute inset-0 animate-fadeIn">
          <SplashScreen event={event} onStart={NOOP} />
        </div>
      )}

      {filtersEligible && activeSlide === "filters" && (
        <div className="pointer-events-none absolute inset-0 animate-fadeIn">
          <EventPhotoBoothLanding event={event} readOnly />
        </div>
      )}

      {/* Siempre montada (aunque no sea el slide visible): su suscripción a
          Firestore queda "caliente" y avisa vía onPhotosChange si hay
          contenido antes de que la rotación le toque el turno, evitando un
          slide vacío al llegar. */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          activeSlide === "gallery" ? "opacity-100" : "opacity-0"
        }`}
      >
        <ScreenSaverGallery
          eventId={event.id}
          photoIntervalSec={event.screenSaverGalleryPhotoIntervalSec ?? 4}
          onPhotosChange={(count) => setGalleryHasPhotos(count > 0)}
        />
      </div>
    </div>
  );
}
