"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FaDownload, FaSync, FaChevronDown, FaChevronRight } from "react-icons/fa";
import {
  fetchUsageReport,
  distributeSpend,
  dayStartMs,
  dayEndMs,
  type UsageReport,
} from "@/app/services/photo-booth/usageReportService";

/** El gasto y la TRM son datos que el usuario copia a mano de AI Studio y del
 * banco; sobreviven al refresco de la página para no volver a tipearlos en
 * cada consulta. */
const LS_SPEND = "usageReport.spendUsd";
const LS_TRM = "usageReport.copPerUsd";

/** "YYYY-MM-DD" de hoy en hora Colombia, para los presets de rango. */
function todayIso(): string {
  return new Date(Date.now() - 5 * 60 * 60_000).toISOString().slice(0, 10);
}

function addDaysIso(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function monthStartIso(isoDay: string, monthOffset = 0): string {
  const [y, m] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + monthOffset, 1)).toISOString().slice(0, 10);
}

function monthEndIso(isoDay: string, monthOffset = 0): string {
  const [y, m] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m + monthOffset, 0)).toISOString().slice(0, 10);
}

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

const usdPrecise = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const cop = (n: number) =>
  n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })
    : "—";

/** Excel en español interpreta "," como separador decimal y ";" como
 * separador de columnas — generar el CSV con coma decimal evita que cada
 * cifra caiga en la celda equivocada al abrirlo. */
function csvCell(value: string | number): string {
  const s = typeof value === "number" ? value.toFixed(2).replace(".", ",") : value;
  return /[";\n]/.test(s) ? `"${s.split('"').join('""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  // BOM: sin él Excel abre el archivo en ANSI y rompe las tildes.
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function UsageReportClient() {
  const today = todayIso();
  const [from, setFrom] = useState<string>(monthStartIso(today));
  const [to, setTo] = useState<string>(today);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spendInput, setSpendInput] = useState<string>("");
  const [trmInput, setTrmInput] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSpendInput(localStorage.getItem(LS_SPEND) ?? "");
    setTrmInput(localStorage.getItem(LS_TRM) ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsageReport({
        fromMs: from ? dayStartMs(from) : null,
        toMs: to ? dayEndMs(to) : null,
      });
      setReport(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const spendUsd = Number(spendInput.replace(",", ".")) || 0;
  const copPerUsd = Number(trmInput.replace(/[.,\s]/g, "")) || 0;

  const { costPerImageUsd, costByEventId } = useMemo(
    () => distributeSpend(report?.events ?? [], report?.totals.done ?? 0, spendUsd),
    [report, spendUsd]
  );

  const applyPreset = (preset: "mes" | "mesPasado" | "7d" | "30d" | "todo") => {
    const t = todayIso();
    if (preset === "mes") {
      setFrom(monthStartIso(t));
      setTo(t);
    } else if (preset === "mesPasado") {
      setFrom(monthStartIso(t, -1));
      setTo(monthEndIso(t, -1));
    } else if (preset === "7d") {
      setFrom(addDaysIso(t, -6));
      setTo(t);
    } else if (preset === "30d") {
      setFrom(addDaysIso(t, -29));
      setTo(t);
    } else {
      setFrom("");
      setTo("");
    }
  };

  const totalDone = report?.totals.done ?? 0;

  const exportCsv = () => {
    if (!report) return;
    const rangeLabel = `${report.from ? report.from.slice(0, 10) : "inicio"}_${
      report.to ? report.to.slice(0, 10) : "hoy"
    }`;
    const rows: (string | number)[][] = [
      [`Informe de uso Magic Camera — ${rangeLabel.replace("_", " a ")}`],
      ["Gasto total del período (USD)", spendUsd],
      ["Costo por imagen (USD)", Number(costPerImageUsd.toFixed(4))],
      ["Imágenes generadas", totalDone],
      [],
      [
        "Evento",
        "Slug",
        "Imágenes generadas",
        "Errores",
        "Pendientes",
        "Total tareas",
        "Primera imagen",
        "Última imagen",
        "% del período",
        "Costo USD",
        ...(copPerUsd > 0 ? ["Costo COP"] : []),
      ],
    ];
    for (const ev of report.events) {
      const pct = totalDone > 0 ? (ev.done / totalDone) * 100 : 0;
      const costUsd = costByEventId[ev.eventId] ?? 0;
      rows.push([
        ev.name,
        ev.slug,
        ev.done,
        ev.error,
        ev.pending,
        ev.total,
        shortDate(ev.firstAt),
        shortDate(ev.lastAt),
        pct,
        costUsd,
        ...(copPerUsd > 0 ? [costUsd * copPerUsd] : []),
      ]);
    }
    rows.push([
      "TOTAL",
      "",
      totalDone,
      report.totals.error,
      report.totals.pending,
      report.totals.total,
      "",
      "",
      100,
      spendUsd,
      ...(copPerUsd > 0 ? [spendUsd * copPerUsd] : []),
    ]);
    downloadCsv(`informe-uso-${rangeLabel}.csv`, rows);
  };

  const colCount = copPerUsd > 0 ? 7 : 6;

  return (
    <main className="min-h-screen text-gray-900 w-full px-4 py-6">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
        Informe de uso y costos
      </h1>
      <p className="text-sm text-neutral-600 mt-1 max-w-3xl">
        Imágenes generadas por evento y el costo que le corresponde a cada uno.
        Google factura el proyecto completo sin separar por evento: pega acá el
        gasto del período que ves en{" "}
        <a
          className="underline text-blue-700"
          href="https://aistudio.google.com/spend"
          target="_blank"
          rel="noreferrer"
        >
          AI Studio → Spend
        </a>{" "}
        y se reparte proporcional a las imágenes de cada evento.
      </p>

      {/* Filtros */}
      <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-xs font-semibold text-neutral-600">
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold text-neutral-600">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mes", "Este mes"],
                ["mesPasado", "Mes pasado"],
                ["7d", "7 días"],
                ["30d", "30 días"],
                ["todo", "Todo"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            <FaSync className={loading ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-neutral-200 pt-4">
          <label className="flex flex-col text-xs font-semibold text-neutral-600">
            Gasto del período en AI Studio (USD)
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 42.50"
              value={spendInput}
              onChange={(e) => {
                setSpendInput(e.target.value);
                localStorage.setItem(LS_SPEND, e.target.value);
              }}
              className="mt-1 w-52 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold text-neutral-600">
            TRM (COP por USD, opcional)
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 4100"
              value={trmInput}
              onChange={(e) => {
                setTrmInput(e.target.value);
                localStorage.setItem(LS_TRM, e.target.value);
              }}
              className="mt-1 w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900"
            />
          </label>
          <button
            onClick={exportCsv}
            disabled={!report}
            className="ml-auto flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 disabled:opacity-50"
          >
            <FaDownload /> Exportar CSV
          </button>
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Resumen */}
      {report && (
        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card
            label="Imágenes generadas"
            value={totalDone.toLocaleString("es-CO")}
            hint={`${report.events.length} evento(s) con actividad`}
          />
          <Card
            label="Gasto del período"
            value={spendUsd > 0 ? usd(spendUsd) : "—"}
            hint={
              spendUsd > 0 && copPerUsd > 0
                ? cop(spendUsd * copPerUsd)
                : "Pégalo desde AI Studio"
            }
          />
          <Card
            label="Costo por imagen"
            value={totalDone > 0 && spendUsd > 0 ? usdPrecise(costPerImageUsd) : "—"}
            hint={
              copPerUsd > 0 && totalDone > 0 && spendUsd > 0
                ? cop(costPerImageUsd * copPerUsd)
                : "gasto ÷ imágenes"
            }
          />
          <Card
            label="Errores / pendientes"
            value={`${report.totals.error} / ${report.totals.pending}`}
            hint="No suman al costo repartido"
          />
        </section>
      )}

      {/* Tabla */}
      <section className="mt-5 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-left">Evento</th>
              <th className="px-4 py-3 text-right">Imágenes</th>
              <th className="px-4 py-3 text-right">Errores</th>
              <th className="px-4 py-3 text-left">Período</th>
              <th className="px-4 py-3 text-right">% uso</th>
              <th className="px-4 py-3 text-right">Costo USD</th>
              {copPerUsd > 0 && <th className="px-4 py-3 text-right">Costo COP</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && report && report.events.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-neutral-500">
                  No hay imágenes en este rango de fechas.
                </td>
              </tr>
            )}
            {!loading &&
              report?.events.map((ev) => {
                const pct = totalDone > 0 ? (ev.done / totalDone) * 100 : 0;
                const costUsd = costByEventId[ev.eventId] ?? 0;
                const isOpen = !!expanded[ev.eventId];
                const days = Object.entries(ev.byDay).sort(([a], [b]) => a.localeCompare(b));
                const brands = Object.entries(ev.byBrand).sort(([, a], [, b]) => b - a);
                return (
                  <React.Fragment key={ev.eventId}>
                    <tr className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            setExpanded((p) => ({ ...p, [ev.eventId]: !p[ev.eventId] }))
                          }
                          className="flex items-center gap-2 text-left font-semibold"
                        >
                          {isOpen ? (
                            <FaChevronDown className="h-3 w-3 text-neutral-400" />
                          ) : (
                            <FaChevronRight className="h-3 w-3 text-neutral-400" />
                          )}
                          {ev.name}
                        </button>
                        {ev.slug && (
                          <span className="ml-5 text-xs text-neutral-500">/{ev.slug}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {ev.done.toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                        {ev.error || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600">
                        {shortDate(ev.firstAt)}
                        <br />
                        <span className="text-neutral-400">→ {shortDate(ev.lastAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{pct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {spendUsd > 0 ? usd(costUsd) : "—"}
                      </td>
                      {copPerUsd > 0 && (
                        <td className="px-4 py-3 text-right tabular-nums">
                          {spendUsd > 0 ? cop(costUsd * copPerUsd) : "—"}
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-neutral-100 bg-neutral-50/60">
                        <td colSpan={colCount} className="px-4 py-4">
                          <div className="grid gap-6 md:grid-cols-2">
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                                Por día
                              </h4>
                              <ul className="mt-2 space-y-1 text-sm">
                                {days.length === 0 && (
                                  <li className="text-neutral-400">Sin datos</li>
                                )}
                                {days.map(([day, n]) => (
                                  <li
                                    key={day}
                                    className="flex justify-between gap-4 tabular-nums"
                                  >
                                    <span className="text-neutral-600">{day}</span>
                                    <span className="font-semibold">
                                      {n}
                                      {spendUsd > 0 && (
                                        <span className="ml-2 font-normal text-neutral-500">
                                          {usd(n * costPerImageUsd)}
                                        </span>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                                Por marca
                              </h4>
                              <ul className="mt-2 space-y-1 text-sm">
                                {brands.length === 0 && (
                                  <li className="text-neutral-400">Sin datos</li>
                                )}
                                {brands.map(([brand, n]) => (
                                  <li
                                    key={brand}
                                    className="flex justify-between gap-4 tabular-nums"
                                  >
                                    <span className="text-neutral-600">{brand}</span>
                                    <span className="font-semibold">{n}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
          </tbody>
          {report && report.events.length > 0 && (
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 font-bold">
              <tr>
                <td className="px-4 py-3">TOTAL</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {totalDone.toLocaleString("es-CO")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{report.totals.error}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">100%</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {spendUsd > 0 ? usd(spendUsd) : "—"}
                </td>
                {copPerUsd > 0 && (
                  <td className="px-4 py-3 text-right tabular-nums">
                    {spendUsd > 0 ? cop(spendUsd * copPerUsd) : "—"}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {report && (
        <p className="mt-3 text-xs text-neutral-500">
          Generado {shortDate(report.generatedAt)} ·{" "}
          {report.scanned.toLocaleString("es-CO")} tareas revisadas en total. El costo por
          imagen es un promedio del período: si en el rango hubo eventos con distinto tipo de
          generación (video, imágenes de referencia extra), consulta cada evento en su propio
          rango de fechas para afinarlo.
        </p>
      )}
    </main>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
