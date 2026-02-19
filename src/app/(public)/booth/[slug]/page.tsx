"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getEventProfileBySlug, EventProfile } from "@/app/services/photo-booth/eventService";
import EventPhotoBoothLanding from "@/app/components/photo-booth/EventPhotoBoothLanding";
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
  const [boothStarted, setBoothStarted] = useState(false);
  const [skipBrandSelection, setSkipBrandSelection] = useState(false);

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

        // Si el evento tiene solo una brand, saltar la selección
        if (eventData.prompts && eventData.prompts.length === 1) {
          setSkipBrandSelection(true);
          // Guardar la única brand en sessionStorage
          sessionStorage.setItem("selectedBrand", eventData.prompts[0]);
          setBoothStarted(true);
        }
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
    <div
      className={`antialiased min-h-screen relative ${
        !boothStarted ? "overflow-hidden" : "overflow-auto"
      }`}
    >
      {/* ScreenSaver - se activa después de 15 segundos de inactividad */}
      <ScreenSaver splashImage={event.splashImage} inactivityTimeout={150000} />

      {!boothStarted ? (
        <EventPhotoBoothLanding
          event={event}
          onStart={(brand, dataProcessingAccepted) => {
            // Guardar brand en sessionStorage para que PhotoBoothWizard lo use
            if (brand) sessionStorage.setItem("selectedBrand", brand);
            // Guardar aceptación de tratamiento de datos
            if (dataProcessingAccepted !== undefined) {
              sessionStorage.setItem("dataProcessingAccepted", String(dataProcessingAccepted));
            }
            setBoothStarted(true);
          }}
        />
      ) : (
        <PhotoBoothWizard
          mirror
          boxSize="min(80vw, 80vh)"
          eventData={event}
          onReset={
            skipBrandSelection
              ? undefined // Si solo hay una brand, no permitir volver a la selección
              : () => setBoothStarted(false) // Si hay múltiples brands, permitir volver
          }
        />
      )}
    </div>
  );
}
