/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import { getActiveEventProfiles, EventProfile } from "@/app/services/eventService";
import Link from "next/link";

export default function EventsLanding() {
  const [events, setEvents] = useState<EventProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        setLoading(true);
        const data = await getActiveEventProfiles();
        setEvents(data);
      } catch (error) {
        console.error("Error loading events:", error);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Cargando eventos...</p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center text-white">
          <p className="text-xl">No hay eventos disponibles</p>
        </div>
      </div>
    );
  }

  const useFlexCenter = events.length <= 3;

  return (
    <div
      className="relative min-h-[100svh] w-full overflow-hidden"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        backgroundColor: "#000",
      }}
    >
      {/* Background - solo si el primer evento tiene bgImage */}
      {events[0]?.bgImage && (
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `url('${events[0].bgImage}')` }}
          aria-hidden
        />
      )}

      <div className="mx-auto flex min-h-[100svh] max-w-[980px] flex-col items-center">
        {/* Top Logo */}
        <div className="w-full px-5 sm:px-6 md:px-8 pt-3 sm:pt-4 md:pt-6">
          <div className="mx-auto w-full max-w-[620px] flex flex-col items-center gap-2">
            {events[0]?.logoTop && (
              <img
                src={events[0].logoTop}
                alt="Logo"
                className="w-full select-none"
                draggable={false}
              />
            )}
          </div>
        </div>

        <h1 className="mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-xl font-semibold text-white drop-shadow-md">
          Selecciona tu evento
        </h1>

        <div className="mt-5 sm:mt-7 w-full px-5 sm:px-6 md:px-8">
          {useFlexCenter ? (
            <div className="flex items-center justify-center flex-wrap gap-6 py-8">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/booth/${event.slug}`}
                  className="group cursor-pointer select-none rounded-xl sm:rounded-2xl backdrop-blur shadow-md sm:shadow-xl ring-1 ring-black/5 transition-transform duration-150 hover:scale-[1.015] active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 bg-white/5 max-w-[360px] w-[min(80vw,320px)]"
                >
                  <article className="flex flex-col items-center justify-center overflow-hidden p-2">
                    <div className="w-full max-w-[320px]">
                      <div className="relative w-full aspect-[4/3] md:aspect-square">
                        <img
                          src={event.bgImage || "/images/placeholder.png"}
                          alt={event.name}
                          className="bg-white absolute inset-0 w-full h-full object-cover"
                          draggable={false}
                          style={{ borderRadius: "30px" }}
                        />
                      </div>
                    </div>
                    <div className="px-4 py-2 text-center font-semibold text-white drop-shadow text-sm sm:text-base">
                      {event.name}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-4 md:gap-5 grid-cols-2 md:grid-cols-3 justify-items-center">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/booth/${event.slug}`}
                  className="group cursor-pointer select-none rounded-xl sm:rounded-2xl backdrop-blur shadow-md sm:shadow-xl ring-1 ring-black/5 transition-transform duration-150 hover:scale-[1.015] active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 bg-white/5 max-w-[320px] w-full"
                >
                  <article className="flex flex-col items-center justify-center overflow-hidden">
                    <div className="w-full max-w-[280px]">
                      <div className="relative w-full aspect-[4/3] md:aspect-square">
                        <img
                          src={event.bgImage || "/images/placeholder.png"}
                          alt={event.name}
                          className="bg-white absolute inset-0 w-full h-full object-cover"
                          draggable={false}
                          style={{ borderRadius: "30px" }}
                        />
                      </div>
                    </div>
                    <div className="px-4 py-2 text-center font-semibold text-white drop-shadow text-sm sm:text-base">
                      {event.name}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Logo */}
        <div className="mt-auto flex-shrink-0 w-full px-5 sm:px-6 md:px-8 pb-6 sm:pb-8 md:pb-10">
          <div className="mx-auto w-full max-w-[400px] flex flex-col items-center gap-2">
            {events[0]?.logoBottom && (
              <img
                src={events[0].logoBottom}
                alt="Logo Inferior"
                className="w-full select-none"
                draggable={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
