"use client";

import React, { useState } from "react";

import AdminList from "@/app/home/components/admin/AdminList";
import ListParticipants from "@/app/home/components/admin/ListParticipants";

export default function AdminPage() {
  const [view, setView] = useState<"tasks" | "participants">("tasks");

  return (
    <main className="min-h-screen text-gray-900 w-full px-4 py-6">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
        Panel Admin
      </h1>
      <p className="text-sm text-neutral-600 mt-1">
        Busca por <code>taskId</code> o revisa las últimas tareas procesadas.
      </p>

      {/* Botones de navegación interna */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setView("tasks")}
          className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all duration-150 ${
            view === "tasks"
              ? "bg-white text-neutral-900 border-2 border-neutral-300 shadow-lg scale-105"
              : "bg-neutral-900 text-white hover:bg-neutral-800 border border-neutral-900"
          }`}
        >
          <span role="img" aria-label="Tareas">
            🗂️
          </span>
          Imagenes por Task
        </button>
        <button
          onClick={() => setView("participants")}
          className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all duration-150 ${
            view === "participants"
              ? "bg-white text-neutral-900 border-2 border-neutral-300 shadow-lg scale-105"
              : "bg-neutral-900 text-white hover:bg-neutral-800 border border-neutral-900"
          }`}
        >
          <span role="img" aria-label="Participantes">
            👥
          </span>
          Participantes
        </button>
      </div>

      {/* Vista dinámica */}
      <div className="mt-6">
        {view === "tasks" && <AdminList />}
        {view === "participants" && <ListParticipants />}
      </div>
    </main>
  );
}
