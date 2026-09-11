/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/server/firebaseAdmin";
import {
  REPORT_TZ_OFFSET_MIN,
  type UsageEventRow,
  type UsageReport,
} from "@/app/services/photo-booth/usageReportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // el informe siempre se recalcula

/**
 * Agregado de `imageTasks` por evento, para el informe de uso/costo del admin.
 *
 * Se lee la colección COMPLETA y se filtra por fecha en memoria, a propósito:
 *
 * - `select()` trae solo los 6 campos que importan, así que el peso de red es
 *   mínimo aunque cada doc tenga urls, prompts y customización.
 * - filtrar por fecha en Firestore obligaría a un índice compuesto
 *   (`eventId` + `createdAt`) que no está versionado en este repo (las reglas
 *   e índices viven solo en la consola), y peor: `createdAt` no es homogéneo
 *   — el wizard escribe `serverTimestamp()` pero hay docs viejos con
 *   `Date.now()` numérico, y una consulta con rango sobre Timestamp los
 *   excluiría en silencio, subcontando eventos pasados justo en el informe
 *   que existe para contarlos bien.
 */

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return null;
}

/** Día "YYYY-MM-DD" en hora Colombia (ver REPORT_TZ_OFFSET_MIN). */
function dayKey(d: Date): string {
  return new Date(d.getTime() + REPORT_TZ_OFFSET_MIN * 60_000)
    .toISOString()
    .slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { db } = getAdminServices();
    const sp = req.nextUrl.searchParams;
    const fromMs = Number(sp.get("from")) || null;
    const toMs = Number(sp.get("to")) || null;

    const [tasksSnap, eventsSnap] = await Promise.all([
      db
        .collection("imageTasks")
        .select("eventId", "status", "createdAt", "finishedAt", "updatedAt", "brand")
        .get(),
      db.collection("events").select("name", "slug").get(),
    ]);

    const eventMeta = new Map<string, { name: string; slug: string }>();
    eventsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      eventMeta.set(d.id, { name: data?.name || "(sin nombre)", slug: data?.slug || "" });
    });

    const rows = new Map<string, UsageEventRow>();
    const totals = { done: 0, error: 0, pending: 0, total: 0 };

    for (const doc of tasksSnap.docs) {
      const data = doc.data() as any;

      // `createdAt` es la fecha de referencia; si falta (docs muy viejos o una
      // escritura que nunca cerró) se cae a finishedAt/updatedAt antes de
      // descartar el doc por fecha.
      const when =
        toDate(data.createdAt) ?? toDate(data.finishedAt) ?? toDate(data.updatedAt);
      if (fromMs && (!when || when.getTime() < fromMs)) continue;
      if (toMs && (!when || when.getTime() > toMs)) continue;

      const eventId: string = data.eventId || "__sin_evento__";
      let row = rows.get(eventId);
      if (!row) {
        const meta = eventMeta.get(eventId);
        row = {
          eventId,
          name:
            eventId === "__sin_evento__"
              ? "(fotos sin evento)"
              : meta?.name ?? "(evento eliminado)",
          slug: meta?.slug ?? "",
          done: 0,
          error: 0,
          pending: 0,
          total: 0,
          firstAt: null,
          lastAt: null,
          byBrand: {},
          byDay: {},
        };
        rows.set(eventId, row);
      }

      const status: string = data.status || "";
      if (status === "done") row.done += 1;
      else if (status === "error") row.error += 1;
      else row.pending += 1;
      row.total += 1;

      // Solo las exitosas alimentan marca/día/rango de fechas: son las que se
      // usan para repartir el gasto, y mezclarlas con errores desalinearía el
      // detalle diario contra el gasto diario de AI Studio.
      if (status === "done") {
        const brand: string = data.brand || "(sin marca)";
        row.byBrand[brand] = (row.byBrand[brand] || 0) + 1;
        if (when) {
          const key = dayKey(when);
          row.byDay[key] = (row.byDay[key] || 0) + 1;
          const iso = when.toISOString();
          if (!row.firstAt || iso < row.firstAt) row.firstAt = iso;
          if (!row.lastAt || iso > row.lastAt) row.lastAt = iso;
        }
      }
    }

    for (const row of rows.values()) {
      totals.done += row.done;
      totals.error += row.error;
      totals.pending += row.pending;
      totals.total += row.total;
    }

    const report: UsageReport = {
      generatedAt: new Date().toISOString(),
      from: fromMs ? new Date(fromMs).toISOString() : null,
      to: toMs ? new Date(toMs).toISOString() : null,
      scanned: tasksSnap.size,
      totals,
      events: [...rows.values()].sort((a, b) => b.done - a.done),
    };

    return NextResponse.json(report);
  } catch (error: any) {
    console.error("Error generando informe de uso:", error);
    return NextResponse.json(
      { error: "No se pudo generar el informe", details: error?.message },
      { status: 500 }
    );
  }
}
