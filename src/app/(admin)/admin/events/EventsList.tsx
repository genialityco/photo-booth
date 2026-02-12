"use client";

import React, { useEffect, useState } from "react";
import {
  EventProfile,
  getEventProfiles,
  deleteEventProfile,
  generateEventUrl,
} from "@/app/services/photo-booth/eventService";
import EventForm from "./EventForm";

export default function EventsList() {
  const [events, setEvents] = useState<EventProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventProfile | null>(null);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await getEventProfiles();
      setEvents(data);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar este evento?")) {
      try {
        await deleteEventProfile(id);
        setEvents(events.filter((e) => e.id !== id));
      } catch (error) {
        console.error("Error deleting event:", error);
        alert("Error al eliminar el evento");
      }
    }
  };

  const handleEdit = (event: EventProfile) => {
    setEditingEvent(event);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingEvent(null);
    loadEvents();
  };

  const handleCreate = () => {
    setEditingEvent(null);
    setShowForm(true);
  };

  if (showForm) {
    return (
      <EventForm
        event={editingEvent}
        onClose={handleFormClose}
        onSave={loadEvents}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Eventos</h1>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Crear Evento
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando eventos...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No hay eventos creados aún.
        </div>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-lg shadow-md p-6 border border-gray-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {event.name}
                  </h2>
                  <p className="text-gray-600 text-sm mt-1">
                    Slug:{" "}
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      {event.slug}
                    </code>
                  </p>
                  <p className="text-gray-600 text-sm mt-2">
                    {event.description && `${event.description}`}
                  </p>

                  {/* Prompts */}
                  {event.prompts && event.prompts.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700">
                        Prompts:
                      </p>
                      <ul className="mt-1 space-y-1">
                        {event.prompts.map((prompt, idx) => (
                          <li key={idx} className="text-sm text-gray-600">
                            • {prompt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="mt-3">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        event.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {event.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  {/* Share URL */}
                  <div className="mt-4 bg-gray-50 p-3 rounded border border-gray-200">
                    <p className="text-xs font-medium text-gray-700 mb-1">
                      URL Compartible:
                    </p>
                    <input
                      type="text"
                      readOnly
                      value={generateEventUrl(
                        typeof window !== "undefined"
                          ? window.location.origin
                          : "http://localhost:3000",
                        event.slug,
                      )}
                      className="w-full px-2 py-1 text-xs bg-white border border-gray-300 rounded text-gray-700"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="ml-4 flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(event)}
                    className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
