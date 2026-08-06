"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getEventProfileBySlug, EventProfile } from "@/app/services/photo-booth/eventService";
import PhotoBoothWizard from "@/app/components/photo-booth/PhotoBoothWizard";
import LoadingScreen from "@/app/components/common/LoadingScreen";
import ScreenSaver from "@/app/components/common/ScreenSaver";

export default function EventBoothPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = React.use(params);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boxSize, setBoxSize] = useState("min(80vw, 80vh)");

  useEffect(() => {
    const handleResize = () => {
      setBoxSize(window.innerWidth < 640 ? "100%" : "min(80vw, 80vh)");
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        setLoading(true);
        const eventData = await getEventProfileBySlug(slug);
        if (!eventData) {
          setError("Evento no encontrado");
          return;
        }
        setEvent(eventData);
        // Store event config in sessionStorage for PhotoBoothWizard to access
        sessionStorage.setItem("currentEvent", JSON.stringify(eventData));
      } catch (err) {
        console.error("Error loading event:", err);
        setError("Error cargando el evento");
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [slug]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !event) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-center">
          <p className="text-xl">{error || "Evento no encontrado"}</p>
          <Link href="/" className="mt-4 inline-block px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="antialiased min-h-screen relative overflow-auto">
      {/* ScreenSaver - splash al inicio (opcional) y reaparición por inactividad */}
      <ScreenSaver
        splashImage={event.splashImage}
        inactivityTimeout={(event.splashInactivityTimeout ?? 150) * 1000}
        startActive={event.showSplashOnStart === true}
      />

      {/* El evento arranca directo en la cámara. La selección de filtro
          (cards + botón Comenzar) se muestra dentro del wizard, tras el preview. */}
      <PhotoBoothWizard
        mirror
        boxSize={boxSize}
        eventData={event}
      />
    </div>
  );
}
