"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  EventProfile,
  getEventProfileById,
  updateEventProfile,
} from "@/app/services/photo-booth/eventService";

export default function ScreenSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageCount, setImageCount] = useState<number>(0);

  const [mosaicDuration, setMosaicDuration] = useState(15);
  const [mosaicAuto, setMosaicAuto] = useState(false);
  const [mosaicTriggerCount, setMosaicTriggerCount] = useState(10);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        setLoading(true);
        const data = await getEventProfileById(id);
        if (data) {
          setEvent(data);
          if (data.screenConfig) {
            setMosaicDuration(data.screenConfig.mosaicDuration || 15);
            setMosaicAuto(data.screenConfig.mosaicAuto || false);
            setMosaicTriggerCount(data.screenConfig.mosaicTriggerCount || 10);
          }
        }
      } catch (error) {
        console.error("Error loading event:", error);
      } finally {
        setLoading(false);
      }
    };

    loadEvent();

    // Listen for image count
    const q = query(
      collection(db, "imageTasks"),
      where("eventId", "==", id),
      where("status", "==", "done")
    );
    const unsub = onSnapshot(q, (snap) => {
      setImageCount(snap.size);
    });

    return () => unsub();
  }, [id]);

  const handleSaveSettings = async () => {
    if (!event) return;
    try {
      setSaving(true);
      await updateEventProfile(event.id, {
        screenConfig: {
          ...event.screenConfig,
          mosaicDuration,
          mosaicAuto,
          mosaicTriggerCount,
        },
      });
      alert("Configuración guardada correctamente");
    } catch (error) {
      console.error("Error saving screen config:", error);
      alert("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerMosaic = async () => {
    if (!event) return;
    try {
      await updateEventProfile(event.id, {
        screenConfig: {
          ...event.screenConfig,
          mosaicDuration,
          mosaicAuto,
          mosaicTriggerCount,
          triggerMosaicAt: Date.now(),
        },
      });
      alert("Mosaico disparado");
    } catch (error) {
      console.error("Error triggering mosaic:", error);
      alert("Error al disparar el mosaico");
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando...</div>;
  if (!event) return <div className="p-8 text-center">Evento no encontrado</div>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto bg-white p-6 rounded-lg shadow-md mt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Comportamiento de Pantalla</h1>
        <button
          onClick={() => router.push("/admin/events")}
          className="text-gray-600 hover:text-gray-900"
        >
          Volver
        </button>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        Configura el comportamiento de la pantalla de visualización ({event.name}).
      </p>

      {/* Image Counter Card */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h3 className="text-blue-900 font-semibold text-lg">Imágenes generadas</h3>
          <p className="text-blue-700 text-sm">Total de fotos listas para este evento</p>
        </div>
        <div className="bg-blue-600 text-white font-bold text-3xl px-6 py-3 rounded-lg shadow-sm">
          {imageCount}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col">
          <label className="font-medium text-gray-700 mb-1">
            Duración de la animación del mosaico (segundos)
          </label>
          <input
            type="number"
            min="1"
            className="border border-gray-300 rounded-lg p-2"
            value={mosaicDuration}
            onChange={(e) => setMosaicDuration(Number(e.target.value))}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="mosaicAuto"
            className="w-5 h-5"
            checked={mosaicAuto}
            onChange={(e) => setMosaicAuto(e.target.checked)}
          />
          <label htmlFor="mosaicAuto" className="font-medium text-gray-700">
            Lanzar mosaico automáticamente
          </label>
        </div>

        <div className={`flex flex-col ${!mosaicAuto ? "opacity-50" : ""}`}>
          <label className="font-medium text-gray-700 mb-1">
            Número de imágenes para lanzar animación automáticamente
          </label>
          <input
            type="number"
            min="1"
            disabled={!mosaicAuto}
            className="border border-gray-300 rounded-lg p-2 disabled:bg-gray-100"
            value={mosaicTriggerCount}
            onChange={(e) => setMosaicTriggerCount(Number(e.target.value))}
          />
        </div>

        <div className="pt-4 flex gap-4">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar Configuración"}
          </button>
          
          <button
            onClick={handleTriggerMosaic}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Lanzar Mosaico Manualmente
          </button>
        </div>
      </div>
    </div>
  );
}
