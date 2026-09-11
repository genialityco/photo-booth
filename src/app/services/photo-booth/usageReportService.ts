/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Informe de uso de la plataforma: cuántas imágenes generó cada evento y, a
 * partir de eso, cuánto costó.
 *
 * El costo NO está en Firestore. Google solo lo publica agregado por proyecto
 * en AI Studio (pantalla "Spend"), sin desglose por evento — desde el lado de
 * Google todas las fotos son la misma API key. Así que lo que hace este
 * informe es el reparto inverso: cuenta las imágenes efectivamente generadas
 * por evento (docs de `imageTasks` en estado "done") y prorratea contra ellas
 * el gasto total del período que el usuario copia de AI Studio. Por eso el
 * costo por imagen es un valor *derivado* (gasto / imágenes) y no una
 * constante quemada en el código: cambia con el modelo, con el tamaño de la
 * salida y con las imágenes de referencia que lleve el prompt de cada marca.
 */

/** Zona horaria en la que se agrupan los días del informe. Colombia (UTC-5),
 * sin horario de verano, que es donde se hacen los eventos: un evento que
 * termina 9pm no debe caer en el día siguiente por usar UTC. */
export const REPORT_TZ_OFFSET_MIN = -300;

export type UsageEventRow = {
  eventId: string;
  /** Nombre del evento en `events`, o un marcador si el doc ya no existe. */
  name: string;
  slug: string;
  /** Imágenes generadas con éxito — la base del costo. */
  done: number;
  /** Tareas que terminaron en error (no siempre gratis: si el error ocurrió
   * después de llamar a Gemini, esa llamada igual se facturó). */
  error: number;
  /** Encoladas / en proceso / estados intermedios que nunca cerraron. */
  pending: number;
  total: number;
  /** ISO de la primera y última imagen generada dentro del rango. */
  firstAt: string | null;
  lastAt: string | null;
  /** Imágenes generadas por marca (`brand` del doc de imageTasks). */
  byBrand: Record<string, number>;
  /** Imágenes generadas por día (clave "YYYY-MM-DD" en hora Colombia). */
  byDay: Record<string, number>;
};

export type UsageReport = {
  generatedAt: string;
  /** Rango efectivamente aplicado (ISO), null = sin límite por ese lado. */
  from: string | null;
  to: string | null;
  /** Docs de `imageTasks` leídos antes de filtrar por fecha. */
  scanned: number;
  totals: { done: number; error: number; pending: number; total: number };
  events: UsageEventRow[];
};

export async function fetchUsageReport(params: {
  fromMs?: number | null;
  toMs?: number | null;
  signal?: AbortSignal;
}): Promise<UsageReport> {
  const qs = new URLSearchParams();
  if (params.fromMs) qs.set("from", String(params.fromMs));
  if (params.toMs) qs.set("to", String(params.toMs));
  const res = await fetch(`/api/reports/usage?${qs.toString()}`, {
    cache: "no-store",
    signal: params.signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body?.error || `Error ${res.status} al cargar el informe`);
  }
  return (await res.json()) as UsageReport;
}

/**
 * Reparte `totalSpendUsd` (el gasto del período copiado de AI Studio) entre
 * los eventos, proporcional a las imágenes generadas por cada uno.
 *
 * Con 0 imágenes en el rango devuelve costo 0 para todos en vez de NaN — el
 * caso real de abrir el informe en un rango vacío.
 */
export function distributeSpend(
  events: UsageEventRow[],
  totalDone: number,
  totalSpendUsd: number
): { costPerImageUsd: number; costByEventId: Record<string, number> } {
  const costPerImageUsd = totalDone > 0 ? totalSpendUsd / totalDone : 0;
  const costByEventId: Record<string, number> = {};
  for (const ev of events) costByEventId[ev.eventId] = ev.done * costPerImageUsd;
  return { costPerImageUsd, costByEventId };
}

/** "YYYY-MM-DD" (hora Colombia) -> epoch ms del inicio de ese día. */
export function dayStartMs(isoDay: string): number {
  return Date.parse(`${isoDay}T00:00:00.000Z`) - REPORT_TZ_OFFSET_MIN * 60_000;
}

/** "YYYY-MM-DD" (hora Colombia) -> epoch ms del final de ese día (inclusive). */
export function dayEndMs(isoDay: string): number {
  return dayStartMs(isoDay) + 24 * 60 * 60_000 - 1;
}
