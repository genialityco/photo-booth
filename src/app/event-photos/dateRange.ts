/**
 * Rango de fechas de la galería pública de un evento (`/event-photos/[slug]`),
 * que viaja en la URL como `?from=...&to=...` — así el admin puede compartir
 * un link que solo muestra las fotos de, por ejemplo, un día de un evento de
 * varios días.
 *
 * Formatos aceptados (hora LOCAL de quien abre el link):
 * - `AAAA-MM-DD`: día completo — `from` desde las 00:00, `to` hasta las
 *   23:59:59.999 (ambos inclusivos).
 * - `AAAA-MM-DDTHH:mm`: hora exacta (lo que devuelve un
 *   <input type="datetime-local">).
 *
 * Ojo: es un filtro de la vista, no un permiso — quien tenga el link puede
 * quitar los parámetros y ver todas las fotos del evento.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** `null` si no viene o no es una fecha válida. */
export function parseRangeParam(
  value: string | null | undefined,
  edge: "start" | "end"
): Date | null {
  if (!value) return null;
  const v = value.trim();
  let d: Date;
  if (DATE_ONLY.test(v)) {
    const [y, m, day] = v.split("-").map(Number);
    d =
      edge === "start"
        ? new Date(y, m - 1, day, 0, 0, 0, 0)
        : new Date(y, m - 1, day, 23, 59, 59, 999);
  } else if (DATE_TIME.test(v)) {
    // Sin zona horaria => el navegador la interpreta como hora local.
    d = new Date(v);
    if (edge === "end" && v.length === 16) d.setSeconds(59, 999);
  } else {
    return null;
  }
  if (Number.isNaN(d.getTime())) return null;
  // `new Date` desborda fechas imposibles en vez de fallar (2026-13-99 ->
  // abril 2027): si el día no es el mismo que se escribió, no era válida.
  const [y, m, day] = v.slice(0, 10).split("-").map(Number);
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  return d;
}

export function buildEventPhotosUrl(
  origin: string,
  slug: string,
  from?: string,
  to?: string
): string {
  const url = new URL(`/event-photos/${encodeURIComponent(slug)}`, origin);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  return url.toString();
}

/** Texto legible del rango, para el encabezado de la galería. */
export function describeRange(from: Date | null, to: Date | null): string {
  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      dateStyle: "medium",
      ...(d.getHours() || d.getMinutes() ? { timeStyle: "short" } : {}),
    });
  const fmtEnd = (d: Date) =>
    d.getHours() === 23 && d.getMinutes() === 59
      ? d.toLocaleDateString(undefined, { dateStyle: "medium" })
      : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (from && to) return `del ${fmt(from)} al ${fmtEnd(to)}`;
  if (from) return `desde el ${fmt(from)}`;
  if (to) return `hasta el ${fmtEnd(to)}`;
  return "";
}
