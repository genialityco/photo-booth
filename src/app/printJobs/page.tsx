/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import {
  listPrintJobsWithFiles,
  type PrintJob,
  type PrintJobFile,
} from "../services/printJobsService";

export default function PrintJobsPage() {
  const [jobs, setJobs] = useState<(PrintJob & { files?: PrintJobFile[] }) []>([]);
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
      const { items, nextCursorId } = await listPrintJobsWithFiles({
        pageSize: 6,
        cursorId: cursor,
        includeFiles: true,     // 👈 trae archivos de cada carpeta
        maxFilesPerJob: 100,
      });
      setJobs((prev) => (cursor ? [...prev, ...items] : items));
      setNextCursor(nextCursorId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(null);
  }, []);

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      {jobs.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">No hay print jobs disponibles.</p>
      )}

      {/* === GRID DE CARDS, UNA POR CARPETA (taskId) === */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {jobs.map((job) => {
          const cover = job.url ?? job.files?.[0]?.url ?? null;
          const coverName = job.files?.[0]?.name ?? `${job.id}.png`;

          return (
            <section
              key={job.id}
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
                <h2 className="text-base font-semibold">Job {job.id}</h2>
                {!!job.createdAt && (
                  <p className="text-[11px] text-neutral-400">
                    Creado: {new Date(job.createdAt).toLocaleString()}
                  </p>
                )}

                {job.files?.length ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {job.files.map((f: PrintJobFile) => (
                      <div
                        key={f.path}
                        className="group rounded-md overflow-hidden border border-white/10 bg-white/5"
                        title={f.name}
                      >
                        <a href={f.url} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={f.url}
                            alt={f.name}
                            className="w-full h-24 object-cover group-hover:opacity-90"
                            loading="lazy"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={() => downloadFile(f.url, f.name)}
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
        {!nextCursor && jobs.length > 0 && (
          <span className="text-xs text-neutral-500">No hay más resultados.</span>
        )}
      </div>
    </div>
  );
}
