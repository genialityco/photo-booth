import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getPhotoBoothPromptById } from "@/app/services/photo-booth/brandService";

/**
 * Pozo de fotos del evento para las pantallas ANIMADAS del ScreenSaver
 * (`ScreenSaverPhotoFolder`, `ScreenSaverEditorialGrid`).
 *
 * Vive aparte porque las dos necesitan exactamente el mismo material —el
 * historial de `imageTasks` del evento, filtrado por prompts vigentes y
 * repartido entre marcas— y solo se diferencian en la coreografía. La galería
 * (`ScreenSaverGallery`) NO usa esto: ella va con `onSnapshot` en vivo porque
 * su gracia es mostrar la última foto apenas se genera.
 */

/** Cuántas fotos se traen para el sorteo. Es el POZO del que sale cada
 * pasada, no lo que se ve: de acá se eligen al azar las pocas que entran en
 * pantalla, así que un evento con cientos de fotos muestra un set distinto en
 * cada vuelta y, sobre todo, en cada vez que el screensaver arranca. */
export const POOL_LIMIT = 400;

export type ScreenSaverPhoto = { id: string; url: string; promptId: string | null };

/** Fisher-Yates. Orden nuevo en cada pasada: es lo que hace que no se repitan
 * siempre las mismas fotos. */
export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Baraja y después INTERCALA por prompt: un evento con varios filtros suele
 * tener rachas largas del mismo (todos eligen el mismo filtro un rato), así
 * que barajar solo no alcanzaba — la selección igual salía con 8 fotos casi
 * iguales. Tomando de a una por prompt por vuelta, los filtros del evento
 * quedan repartidos.
 */
export function interleaveByPrompt(photos: ScreenSaverPhoto[]): ScreenSaverPhoto[] {
  const groups = new Map<string, ScreenSaverPhoto[]>();
  for (const photo of photos) {
    const key = photo.promptId || "sin-prompt";
    const bucket = groups.get(key);
    if (bucket) bucket.push(photo);
    else groups.set(key, [photo]);
  }

  const buckets = shuffle([...groups.values()]).map(shuffle);
  const longest = Math.max(0, ...buckets.map((b) => b.length));
  const out: ScreenSaverPhoto[] = [];
  for (let i = 0; i < longest; i++) {
    for (const bucket of buckets) if (i < bucket.length) out.push(bucket[i]);
  }
  return out;
}

/**
 * Lectura puntual (no `onSnapshot`): estas pantallas son piezas ambientales,
 * no el feed en vivo. El screensaver se monta de nuevo en cada inactividad,
 * así que igual traen datos frescos seguido.
 *
 * `promptIds` son los prompts asignados al evento (`event.prompts`). Solo se
 * devuelven fotos generadas con los que además siguen ACTIVOS: un evento
 * acumula fotos de prompts que después se le sacaron o se dieron de baja, y
 * esas ya no representan al evento.
 */
export async function loadScreenSaverPhotos(
  eventId: string,
  promptIds: string[]
): Promise<ScreenSaverPhoto[]> {
  // Qué prompts del evento siguen activos. Son 2-4 lecturas por montaje.
  const resolved = await Promise.all(
    promptIds.map((id) =>
      getPhotoBoothPromptById(id)
        .then((prompt) => (prompt?.active ? id : null))
        .catch(() => null)
    )
  );
  const activeIds = resolved.filter((id): id is string => id !== null);

  // Degradado en dos escalones para no dejar la pantalla vacía por una config
  // a medias: si ninguno de los prompts del evento figura como activo, se usan
  // igual los asignados; si el evento no tiene prompts, no se filtra nada.
  const allowed = new Set(activeIds.length > 0 ? activeIds : promptIds);

  const snap = await getDocs(
    query(
      collection(db, "imageTasks"),
      where("eventId", "==", eventId),
      where("status", "==", "done"),
      orderBy("finishedAt", "desc"),
      limit(POOL_LIMIT)
    )
  );

  const photos: ScreenSaverPhoto[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as { url?: string; promptId?: string };
    // Sin `url` no hay nada que mostrar (tareas viejas, o generaciones que
    // solo dejaron video).
    if (!data.url) continue;
    // Fotos de prompts que ya no van con el evento (o sin promptId, que no se
    // pueden atribuir) quedan afuera.
    if (allowed.size > 0 && (!data.promptId || !allowed.has(data.promptId))) continue;
    photos.push({ id: docSnap.id, url: data.url, promptId: data.promptId ?? null });
  }

  return photos;
}
