"use client";

import { listPrintJobsWithFiles, listPrintJobsWithFilesVideo, PrintJob } from "@/app/services/printJobsService";
import { useEffect, useMemo, useState } from "react";


const PAGE_SIZE = 5;

type TimestampLike = {
    toDate?: () => Date;
    seconds?: number;
    nanoseconds?: number;
};

type Participant = Partial<PrintJob> & {
    celular?: string | null;
    createdAt?: Date | number | string | TimestampLike | null;
};

const nonEmpty = (v: unknown): v is string =>
    typeof v === "string" && v.trim() !== "";

const hasRequired = (job: Participant): boolean => {
    const phone = job.celular ?? job.telefono;
    return nonEmpty(job.nombre) && nonEmpty(job.cargo) && nonEmpty(job.empresa) && nonEmpty(phone);
};

const toDateSafe = (value: Participant["createdAt"]): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;

    if (typeof value === "number") return new Date(value);

    if (typeof value === "string") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    if (typeof (value as TimestampLike)?.toDate === "function") {
        return (value as TimestampLike).toDate!();
    }

    if (typeof (value as TimestampLike)?.seconds === "number") {
        return new Date(((value as TimestampLike).seconds as number) * 1000);
    }

    return null;
};

export default function PrintJobsPage() {
    const [jobs, setJobs] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);

    // 👉 Traer TODOS los registros iterando por páginas del servicio
    const fetchJobs = async () => {
        setLoading(true);
        try {
            const pageSize = 100; // máximo recomendado por query
            let cursorId: string | null = null;
            const all: Participant[] = [];

            while (true) {
                const { items, nextCursorId } = await listPrintJobsWithFilesVideo({
                    pageSize,
                    includeFiles: false,
                    cursorId,
                });

                if (items?.length) {
                    all.push(...(items as Participant[]));
                }

                if (!nextCursorId) break;
                cursorId = nextCursorId;
            }

            // Orden estable por createdAt DESC (por si alguna página llegó desordenada)
            all.sort((a, b) => {
                const da = toDateSafe(a.createdAt)?.getTime() ?? 0;
                const db = toDateSafe(b.createdAt)?.getTime() ?? 0;
                return db - da; // desc
            });

            setJobs(all);
            setPage(1); // reinicia a página 1 al recargar
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- Filtro y paginación ----
    const filteredJobs = useMemo<Participant[]>(
        () => (Array.isArray(jobs) ? jobs.filter(hasRequired) : []),
        [jobs]
    );

    const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));

    // Si cambia el total, corrige página actual
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [totalPages, page]);

    const start = (page - 1) * PAGE_SIZE;
    const pageJobs = filteredJobs.slice(start, start + PAGE_SIZE);

    // Descargar la tabla como CSV (solo visibles tras filtro)
    const downloadCSV = () => {
        if (!filteredJobs.length) return;

        const headers = ["ID", "Creado", "Nombre", "Telefono/Celular", "Empresa", "Correo", "Cargo"];
        const rows = filteredJobs.map((job) => {
            const created = toDateSafe(job.createdAt);
            const phone = job.celular ?? job.telefono ?? "";
            return [
                job.id ?? "",
                created ? created.toLocaleString() : "",
                job.nombre ?? "",
                phone,
                job.empresa ?? "",
                job.correo ?? "",
                job.cargo ?? "",
            ];
        });

        const csvContent = [headers, ...rows]
            .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
            .join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "participantes.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="px-4 py-6 max-w-4xl mx-auto text-white">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">Participantes</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={downloadCSV}
                        className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 active:bg-amber-700 shadow-lg shadow-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading || filteredJobs.length === 0}
                    >
                        Descargar tabla CSV
                    </button>
                </div>
            </div>

            {/* Tabla con estilo oscuro/semitransparente */}
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-xl shadow-black/30">
                <table className="min-w-[700px] divide-y divide-white/10">
                    <thead className="bg-white/5">
                        <tr>
                            <th className="px-5 py-3 text-left text-base font-semibold tracking-wide text-white/90 uppercase">Creado</th>
                            <th className="px-5 py-3 text-left text-base font-semibold tracking-wide text-white/90 uppercase">Nombre</th>
                            <th className="px-5 py-3 text-left text-base font-semibold tracking-wide text-white/90 uppercase">Teléfono</th>
                            <th className="px-5 py-3 text-left text-base font-semibold tracking-wide text-white/90 uppercase">Empresa</th>
                            <th className="px-5 py-3 text-left text-base font-semibold tracking-wide text-white/90 uppercase">Correo</th>
                            <th className="px-5 py-3 text-left text-base font-semibold tracking-wide text-white/90 uppercase">Cargo</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-white/10">
                        {pageJobs.map((job, idx) => {
                            const phone = job.celular ?? job.telefono ?? "";
                            return (
                                <tr
                                    key={job.id ?? `${start + idx}`}
                                    className="odd:bg-white/0 even:bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    <td className="px-5 py-3 text-base text-white">
                                        {(() => {
                                            const d = toDateSafe(job.createdAt);
                                            return d ? d.toLocaleString() : "";
                                        })()}
                                    </td>
                                    <td className="px-5 py-3 text-base text-white">{job.nombre ?? ""}</td>
                                    <td className="px-5 py-3 text-base text-white/90">{phone}</td>
                                    <td className="px-5 py-3 text-base text-white/90">{job.empresa ?? ""}</td>
                                    <td className="px-5 py-3 text-base text-white/90">{job.correo ?? ""}</td>
                                    <td className="px-5 py-3 text-base text-white/90">{job.cargo ?? ""}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            {filteredJobs.length > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-white/70">
                        Mostrando{" "}
                        <span className="font-semibold text-white">
                            {start + 1}–{Math.min(start + PAGE_SIZE, filteredJobs.length)}
                        </span>{" "}
                        de <span className="font-semibold text-white">{filteredJobs.length}</span>
                    </p>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <span className="text-sm text-white/80">
                            Página <span className="font-semibold text-white">{page}</span> / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}

            {loading && <p className="mt-4 text-sm text-white/70">Cargando todos los registros…</p>}
            {!loading && filteredJobs.length === 0 && (
                <p className="mt-4 text-sm text-white/70">No hay participantes disponibles.</p>
            )}
        </div>
    );
}
