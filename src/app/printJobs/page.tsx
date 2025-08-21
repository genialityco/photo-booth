// app/print-jobs/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
    listPrintJobsWithFiles,
    type PrintJob,
    type PrintJobFile,
} from "../services/printJobsService";

export default function PrintJobsPage() {
    const [jobs, setJobs] = useState<(PrintJob & { files?: PrintJobFile[] })[]>([]);
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

    const fetchPage = async (cursorId: string | null = null) => {
        setLoading(true);
        try {
            const { items, nextCursorId } = await listPrintJobsWithFiles({
                pageSize: 6,
                cursorId,
                includeFiles: true,
                maxFilesPerJob: 100,
            });
            setJobs((prev) => (cursorId ? [...prev, ...items] : items));
            setNextCursor(nextCursorId);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPage(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="px-4 py-6 max-w-7xl mx-auto">
            <h1 className="text-2xl md:text-3xl font-bold mb-6">Print Jobs</h1>

            {jobs.length === 0 && !loading && (
                <p className="text-sm text-neutral-500">No hay print jobs disponibles.</p>
            )}

            {/* === GRID EN COLUMNAS DE CARDS === */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {jobs.map((job) => {
                    const primaryImageUrl = job.files?.[0]?.url ?? null;
                    const primaryName =
                        job.files?.[0]?.name || (job.name ? `${job.name}.png` : `${job.id}.png`);

                    return (
                        <section
                            key={job.id}
                            className="border border-white/10 rounded-2xl overflow-hidden bg-black/20 flex flex-col"
                        >
                            {/* Imagen principal */}
                            {primaryImageUrl ? (
                                <div className="relative">
                                    <a
                                        href={primaryImageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block"
                                    >
                                        <img
                                            src={primaryImageUrl}
                                            alt={job.name || `Job ${job.id}`}
                                            className="w-full h-56 object-cover"
                                            loading="lazy"
                                        />
                                    </a>

                                    {/* Botón descargar overlay en la imagen */}
                                    <button
                                        type="button"
                                        onClick={() => downloadFile(primaryImageUrl, primaryName)}
                                        className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black/80 text-sm"
                                        aria-label="Descargar imagen principal"
                                    >
                                        Descargar
                                    </button>
                                </div>
                            ) : (
                                <div className="h-56 flex items-center justify-center text-xs text-neutral-500">
                                    Sin imagen principal
                                </div>
                            )}

                            {/* Texto + acciones */}
                            <div className="p-4 flex flex-col gap-2">
                                <h2 className="text-base font-semibold">
                                    {job.name || `Job ${job.id}`}
                                </h2>
                                {job.description && (
                                    <p className="text-xs text-neutral-400 line-clamp-2">{job.description}</p>
                                )}

                                {/* Thumbnails en grid dentro de la card */}
                                {job.files?.length ? (
                                    <div className="mt-2 grid grid-cols-3 gap-2">
                                        {job.files.map((f) => (
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
                                    !primaryImageUrl && (
                                        <p className="text-xs text-neutral-500">Sin archivos en la carpeta.</p>
                                    )
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
