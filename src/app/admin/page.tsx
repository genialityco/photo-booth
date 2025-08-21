"use client";

import React from "react";
import AdminList from "./components/AdminList";

export default function AdminPage() {
  return (
    <main className="min-h-screen w-full px-4 py-6">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
        Panel Admin · Imagenes por Task
      </h1>
      <p className="text-sm text-neutral-600 mt-1">
        Busca por <code>taskId</code> o revisa las últimas tareas procesadas. Puedes abrir o descargar la imagen con marco y la imagen IA.
      </p>

      <div className="mt-6">
        <AdminList />
      </div>
    </main>
  );
}
