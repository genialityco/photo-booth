"use client";

import { useEffect, useMemo, useState } from "react";
import { listPrintJobsWithFiles, type PrintJob } from "@/app/services/photo-booth/printJobsService";

const PAGE_SIZE = 5;

/* =========================
   Tipos auxiliares
========================= */
type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
};

type Participant = Partial<PrintJob> & {
  celular?: string | null;
  createdAt?: Date | number | string | TimestampLike | null;
};

/* =========================
   Helpers
========================= */
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

/* =========================
   Componente
========================= */
export default function PrintJobsPage() {
  const [jobs, setJobs] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);

  // Obtener solo los print jobs (sin archivos ni fotos)
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { items } = await listPrintJobsWithFiles({
        pageSize: 100,
        includeFiles: false,
      });
      setJobs((items ?? []) as Participant[]);
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

  const [page, setPage] = useState(1);
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
    <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 max-w-4xl mx-auto text-white">
      <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4">Participantes</h1>

      <button
        onClick={downloadCSV}
        className="mb-4 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-500 active:bg-amber-700 shadow-lg shadow-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={loading || filteredJobs.length === 0}
      >
        Descargar CSV
      </button>

      {/* Tabla con estilo oscuro/semitransparente, agrandada */}
      <div className="overflow-x-auto rounded-lg sm:rounded-lg md:rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-xl shadow-black/30">
        <table className="min-w-full divide-y divide-white/10 text-xs sm:text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-left font-semibold tracking-wide text-white/90 uppercase">Nombre</th>
              <th className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-left font-semibold tracking-wide text-white/90 uppercase hidden sm:table-cell">Teléfono</th>
              <th className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-left font-semibold tracking-wide text-white/90 uppercase hidden md:table-cell">Empresa</th>
              <th className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-left font-semibold tracking-wide text-white/90 uppercase hidden lg:table-cell">Correo</th>
              <th className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-left font-semibold tracking-wide text-white/90 uppercase hidden xl:table-cell">Cargo</th>
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
                  <td className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-white truncate">{job.nombre ?? ""}</td>
                  <td className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-white/90 hidden sm:table-cell truncate">{phone}</td>
                  <td className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-white/90 hidden md:table-cell truncate">{job.empresa ?? ""}</td>
                  <td className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-white/90 hidden lg:table-cell truncate">{job.correo ?? ""}</td>
                  <td className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 text-white/90 hidden xl:table-cell truncate">{job.cargo ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {filteredJobs.length > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs sm:text-sm text-white/70 text-center sm:text-left">
            Mostrando{" "}
            <span className="font-semibold text-white">
              {start + 1}–{Math.min(start + PAGE_SIZE, filteredJobs.length)}
            </span>{" "}
            de <span className="font-semibold text-white">{filteredJobs.length}</span>
          </p>

          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs sm:text-sm text-white/80 whitespace-nowrap">
              Pg <span className="font-semibold text-white">{page}</span>/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {loading && <p className="mt-4 text-xs sm:text-sm text-white/70">Cargando...</p>}
      {!loading && filteredJobs.length === 0 && (
        <p className="mt-4 text-xs sm:text-sm text-white/70">No hay participantes disponibles.</p>
      )}
    </div>
  );
}
