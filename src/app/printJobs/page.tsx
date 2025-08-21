/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import {
  listPrintTaskFolders,
  type TaskFolder,
  type TaskFile,
} from "../services/printJobsService";

export default function PrintJobsPage() {
  const [tasks, setTasks] = useState<TaskFolder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Descarga segura (cross-origin) usando blob
  const downloadFile = async (url: string, fileName: string) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName || "archivo";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("Download failed:", e);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const fetchPage = async (cursor: string | null = null) => {
    setLoading(true);
    try {
      const { items, nextCursor: nc } = await listPrintTaskFolders({
        pageSize: 6,
        cursor,
        includeFiles: true,     // 👈 trae archivos de cada carpeta
        maxFilesPerTask: 100,
      });
      setTasks((prev) => (cursor ? [...prev, ...items] : items));
      setNextCursor(nc);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(null);
  }, []);

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      {tasks.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">No hay tasks en prints/.</p>
      )}

      {/* === GRID DE CARDS, UNA POR CARPETA (taskId) === */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {tasks.map((task) => {
          const cover = task.coverUrl ?? task.files?.[0]?.photoUrl ?? null;
          const coverName = task.files?.[0]?.name ?? `${task.taskId}.png`;

          return (
            <section
              key={task.taskId}
              className="border border-white/10 rounded-2xl overflow-hidden bg-black/20 flex flex-col"
            >
              {/* Portada */}
              {cover ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => downloadFile(cover, coverName)}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black/80 text-sm"
                    aria-label="Descargar portada"
                  >
                    Descargar
                  </button>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-xs text-neutral-500">
                  Sin portada
                </div>
              )}

              {/* Texto + thumbnails */}
              <div className="p-4 flex flex-col gap-2">
                <h2 className="text-base font-semibold">Task {task.taskId}</h2>
                {!!task.updatedAt && (
                  <p className="text-[11px] text-neutral-400">
                    Actualizado: {new Date(task.updatedAt).toLocaleString()}
                  </p>
                )}

                {task.files?.length ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {task.files.map((f: TaskFile) => (
                      <div
                        key={f.path}
                        className="group rounded-md overflow-hidden border border-white/10 bg-white/5"
                        title={f.name}
                      >
                        <a href={f.photoUrl} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={f.photoUrl}
                            alt={f.name}
                            className="w-full h-24 object-cover group-hover:opacity-90"
                            loading="lazy"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={() => downloadFile(f.photoUrl, f.name)}
                          className="w-full text-[11px] px-2 py-1 bg-neutral-900/70 hover:bg-neutral-800"
                          aria-label={`Descargar ${f.name}`}
                        >
                          Descargar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">Sin archivos en la carpeta.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-3">
        {nextCursor && (
          <button
            onClick={() => fetchPage(nextCursor)}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60"
          >
            {loading ? "Cargando..." : "Cargar más"}
          </button>
        )}
        {!nextCursor && tasks.length > 0 && (
          <span className="text-xs text-neutral-500">No hay más resultados.</span>
        )}
      </div>
    </div>
  );
}
