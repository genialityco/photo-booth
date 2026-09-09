"use client";

import React, { useEffect, useState } from "react";

import AdminList from "@/app/components/admin/AdminList";
import {
  getEventProfileBySlugAnyStatus,
  type EventProfile,
} from "@/app/services/photo-booth/eventService";
import {
  getPhotoBoothPromptsByIds,
  type PhotoBoothPrompt,
} from "@/app/services/photo-booth/brandService";

/**
 * Galería de imágenes de un solo evento, identificada por su `slug`.
 *
 * Es una vista pública/compartible: vive FUERA del grupo de rutas `(admin)`, así
 * que no arrastra el <Sidebar/> del panel ni ninguna navegación de admin. Solo
 * deja ver y descargar las fotos y filtrar por marca (las de ese evento) o por
 * día — `AdminList` corre en modo `readOnly` (sin botón de eliminar) y con el
 * evento fijo (sin selector de evento).
 *
 * El layout raíz bloquea el scroll global (`overflow-hidden`), por eso esta
 * página abre su propio contenedor con scroll vertical.
 */
export default function EventPhotosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = React.use(params);

  const [event, setEvent] = useState<EventProfile | null>(null);
  const [brands, setBrands] = useState<PhotoBoothPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const ev = await getEventProfileBySlugAnyStatus(slug);
        setEvent(ev);
        if (ev?.prompts?.length) {
          setBrands(await getPhotoBoothPromptsByIds(ev.prompts));
        } else {
          setBrands([]);
        }
      } catch (error) {
        console.error("Error loading event photos page:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  return (
    <main className="h-dvh w-full overflow-y-auto overscroll-contain bg-white text-gray-900">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        {loading ? (
          <div className="p-8 text-center">Cargando...</div>
        ) : !event ? (
          <div className="p-8 text-center">Evento no encontrado</div>
        ) : (
          <>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Imágenes de {event.name}
            </h1>
            <p className="text-sm text-neutral-600 mt-1 mb-6">
              Fotos generadas para este evento. Puedes filtrar por marca del
              evento o por día.
            </p>

            <AdminList
              lockedEventId={event.id}
              lockedEventName={event.name}
              brandOptions={brands}
              readOnly
            />
          </>
        )}
      </div>
    </main>
  );
}
