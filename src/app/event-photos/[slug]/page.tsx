"use client";

import React, { useEffect, useMemo, useState } from "react";

import AdminList from "@/app/components/admin/AdminList";
import {
  getEventProfileBySlugAnyStatus,
  type EventProfile,
} from "@/app/services/photo-booth/eventService";
import {
  getPhotoBoothPromptsByIds,
  type PhotoBoothPrompt,
} from "@/app/services/photo-booth/brandService";
import { describeRange, parseRangeParam } from "@/app/event-photos/dateRange";

/**
 * Galería de imágenes de un solo evento, identificada por su `slug`.
 *
 * Es una vista pública/compartible: vive FUERA del grupo de rutas `(admin)`, así
 * que no arrastra el <Sidebar/> del panel ni ninguna navegación de admin. Solo
 * deja ver y descargar las fotos y filtrar por marca (las de ese evento) o por
 * día — `AdminList` corre en modo `readOnly` (sin botón de eliminar) y con el
 * evento fijo (sin selector de evento).
 *
 * `?from=&to=` (opcionales, ver dateRange.ts) acotan la galería a un rango de
 * fechas: el link que arma el botón "Imágenes" del admin de eventos.
 *
 * El layout raíz bloquea el scroll global (`overflow-hidden`), por eso esta
 * página abre su propio contenedor con scroll vertical.
 */
export default function EventPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { slug } = React.use(params);
  const { from: fromParam, to: toParam } = React.use(searchParams);

  const range = useMemo(() => {
    const from = parseRangeParam(fromParam, "start");
    const to = parseRangeParam(toParam, "end");
    // Un parámetro presente pero ilegible se avisa en vez de ignorarlo en
    // silencio (si no, se mostrarían fotos fuera del rango que se pidió).
    const invalid = (!!fromParam && !from) || (!!toParam && !to) || (!!from && !!to && from > to);
    return { from, to, invalid };
  }, [fromParam, toParam]);
  const hasRange = !!(range.from || range.to);

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
        ) : range.invalid ? (
          <div className="p-8 text-center">
            El rango de fechas del link no es válido. Usa{" "}
            <code>?from=AAAA-MM-DD&amp;to=AAAA-MM-DD</code>, con la fecha de
            inicio anterior a la de fin.
          </div>
        ) : (
          <>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Imágenes de {event.name}
            </h1>
            {hasRange && (
              <p className="mt-2 inline-block rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-sm font-semibold text-teal-800">
                Fotos {describeRange(range.from, range.to)}
              </p>
            )}
            <p className="text-sm text-neutral-600 mt-1 mb-6">
              Fotos generadas para este evento. Puedes filtrar por marca del
              evento o por día.
            </p>

            <AdminList
              lockedEventId={event.id}
              lockedEventName={event.name}
              brandOptions={brands}
              readOnly
              dateRange={hasRange ? { from: range.from, to: range.to } : undefined}
            />
          </>
        )}
      </div>
    </main>
  );
}
