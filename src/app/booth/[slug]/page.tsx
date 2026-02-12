"use client";

import React, { useEffect, useState } from "react";
import { getEventProfileBySlug, EventProfile } from "@/app/services/eventService";
import EventPhotoBoothLanding from "@/app/home/components/public/EventPhotoBoothLanding";
import PhotoBoothWizard from "@/app/home/components/public/PhotoBoothWizard";

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
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-center">
          <p className="text-xl">{error || "Evento no encontrado"}</p>
          <a href="/" className="mt-4 inline-block px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg">
            Volver al inicio
          </a>
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
      {!boothStarted ? (
        <EventPhotoBoothLanding
          event={event}
          onStart={() => setBoothStarted(true)}
        />
      ) : (
        <PhotoBoothWizard
          mirror
          boxSize="min(50vw, 70svh)"
          eventData={event}
        />
      )}
    </div>
  );
}
