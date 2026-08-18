/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/firebaseConfig";
import {
  collection,
  addDoc,
  Timestamp,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  where,
} from "firebase/firestore";

export type EventProfile = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  bgImage?: string;
  logoTop?: string;
  logoBottom?: string;
  frameImage?: string;
  buttonImage?: string;
  loadingPageImage?: string;
  /** GIF o WEBM opcional para la pantalla de carga; si está presente, tiene prioridad sobre loadingPageImage. */
  loadingMediaUrl?: string;
  splashImage?: string;
  loadingMessage?: string;
  /** Subtítulo opcional bajo el mensaje principal de la pantalla de carga
   * (ej. "Tito está mezclando los colores..."). */
  loadingSubtitle?: string;
  /** Color (hex) del título de la pantalla de carga. Default "#ef4444" (rojo). */
  loadingTitleColor?: string;
  /** Color (hex) del subtítulo de la pantalla de carga. Default "#1a1a1a". */
  loadingSubtitleColor?: string;
  showLogosInLoader?: boolean;
  enableFrame?: boolean;
  dataProcessingText?: string;
  generationType?: "IMAGE" | "BGVIDEO" | "VIDEO";
  /** Animación al hacer click en los botones del wizard (ej. confeti). */
  buttonClickEffect?: "NONE" | "CONFETTI" | "PAINT_SPLASH";
  /** Controlar la app con un cursor manejado por gestos de mano (pellizco = click). */
  handCursorEnabled?: boolean;
  /**
   * Usar la cámara para detectar la mano durante el paso de revelado
   * (borrar el velo con la mano / mover el rodillo). Independiente de
   * `handCursorEnabled` (ese es el cursor global de navegación). Por
   * compatibilidad, los eventos sin este campo NO activan la cámara ahí y
   * usan solo el fallback táctil (tocar/arrastrar la pantalla) — importante
   * porque el paso de revelado suele abrirse también desde el celular
   * personal del asistente, no solo desde un kiosco fijo.
   */
  handRevealEnabled?: boolean;
  /**
   * Efecto para revelar la foto generada: sin efecto (pasa directo al
   * resultado), borrar el velo con la mano, pintar con un rodillo 3D
   * (descubre la foto de un velo sólido), o el mismo rodillo pero arrancando
   * la foto en blanco y negro y pintando el color al pasarlo. Por
   * compatibilidad, los eventos sin este campo se comportan como
   * "HAND_WIPE" (comportamiento original).
   */
  revealEffect?: "NONE" | "HAND_WIPE" | "ROLLER" | "ROLLER_COLOR";
  /**
   * Pantalla inicial con imagen (splashImage) + botón "Comenzar" antes del
   * resto del flujo. Por compatibilidad, los eventos sin este campo NO la
   * muestran (comportamiento original).
   */
  showSplashScreen?: boolean;
  /**
   * Si está activado, se toma la foto primero y la selección de filtro/marca
   * aparece después (entre el preview confirmado y la generación). Por
   * compatibilidad, los eventos sin este campo mantienen el orden original
   * (filtro primero, luego captura).
   */
  captureBeforeFilter?: boolean;
  /**
   * Estilo visual de la pantalla de captura. "CLASSIC" (o sin este campo) es
   * el comportamiento original. "VIEWFINDER" agrega una guía tipo visor de
   * cámara (grilla, esquinas, silueta de rostro y textos de instrucción)
   * sobre la vista de la cámara.
   */
  captureViewStyle?: "CLASSIC" | "VIEWFINDER";
  /**
   * Video en loop para la pantalla de inactividad (ScreenSaver), como
   * alternativa a splashImage. Si está presente, tiene prioridad sobre
   * splashImage en esa pantalla.
   */
  screenSaverVideoUrl?: string;
  /**
   * Contenido configurable de la pantalla de splash inicial (independiente
   * de `splashImage`/`screenSaverVideoUrl`, que son solo del ScreenSaver).
   * El fondo y el logo superior de esta pantalla reutilizan `bgImage` y
   * `logoTop`. Todos estos campos son opcionales: sin configurar, el
   * componente aplica los valores por defecto de la campaña de referencia
   * ("Tu rostro, tu arte").
   */
  splashTitle?: string;
  splashTitleColor?: string;
  splashSubtitle?: string;
  splashSubtitleColor?: string;
  /** Imagen de la tarjeta central (mascota/logo secundario); sin ella, la tarjeta no se muestra. */
  splashCardImage?: string;
  splashWord1?: string;
  splashWord1Color?: string;
  splashWord2?: string;
  splashWord2Color?: string;
  splashLoaderColorFrom?: string;
  splashLoaderColorTo?: string;
  splashButtonText?: string;
  splashButtonColorFrom?: string;
  splashButtonColorTo?: string;
  /**
   * Habilita la pantalla opcional "Dale tu toque" (paleta de color, textura
   * e intensidad) entre el preview confirmado y la generación. Los valores
   * elegidos se guardan en el doc de imageTasks y se aplican al prompt de
   * IA. Por compatibilidad, los eventos sin este campo no la muestran.
   */
  imageCustomizationEnabled?: boolean;
  /**
   * Animación de fondo detrás de toda la app (landing, wizard, resultado).
   * "NONE" (o sin este campo, comportamiento original) = sin animación.
   * "FLOATING_ORBS" = esferas de colores flotando lentamente de fondo.
   */
  backgroundAnimation?: "NONE" | "FLOATING_ORBS";
  /**
   * Tiempo máximo (segundos) que se le da a la persona para "pintar"/revelar
   * la foto (borrar el velo con la mano o el rodillo) antes de avanzar
   * automáticamente al resultado. Por compatibilidad, los eventos sin este
   * campo usan 28 segundos (comportamiento original).
   */
  paintTimeSeconds?: number;
  prompts: string[];
  isActive: boolean;
  screenConfig?: {
    mosaicDuration: number;
    mosaicAuto: boolean;
    mosaicTriggerCount: number;
    mosaicImageMultiplier?: number;
    mosaicAnimation?: "fall" | "scale-up";
    triggerMosaicAt?: number;
  };
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
};

const COLLECTION = "events";

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) throw new Error("Invalid Data URL format");
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Upload image using Next.js API route (avoids CORS issues)
 */
async function uploadImageViaAPI(
  imageData: string,
  fileName: string,
  eventSlug: string
): Promise<string> {
  try {
    // Use the Next.js API route instead of Cloud Function directly
    const response = await fetch("/api/storage/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataUrl: imageData,
        desiredPath: `events/${eventSlug}/${fileName}`,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(error.error || "Failed to upload image");
    }

    const result = await response.json();
    return result.url;
  } catch (error) {
    console.error("Error uploading image via API:", error);
    throw error;
  }
}

/**
 * Create a new event profile
 */
export async function createEventProfile(
  data: Partial<EventProfile & Record<string, any>>
): Promise<string> {
  try {
    const docData: Record<string, any> = {
      slug: data.slug || "",
      name: data.name || "",
      description: data.description || "",
      prompts: Array.isArray(data.prompts) ? data.prompts : [],
      isActive: data.isActive !== false,
      showLogosInLoader: data.showLogosInLoader !== false,
      enableFrame: data.enableFrame !== false,
      dataProcessingText: data.dataProcessingText || "",
      generationType: data.generationType || "IMAGE",
      buttonClickEffect: data.buttonClickEffect || "NONE",
      handCursorEnabled: data.handCursorEnabled === true,
      handRevealEnabled: data.handRevealEnabled === true,
      revealEffect: data.revealEffect || "HAND_WIPE",
      showSplashScreen: data.showSplashScreen === true,
      captureBeforeFilter: data.captureBeforeFilter === true,
      captureViewStyle: data.captureViewStyle || "CLASSIC",
      imageCustomizationEnabled: data.imageCustomizationEnabled === true,
      backgroundAnimation: data.backgroundAnimation || "NONE",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Image fields to process
    // "imageFields": el mismo mecanismo genérico (por content-type) también
    // sirve para subir el video del screensaver.
    const imageFields = ["bgImage", "logoTop", "logoBottom", "frameImage", "buttonImage", "loadingPageImage", "loadingMediaUrl", "splashImage", "screenSaverVideoUrl", "splashCardImage"];

    for (const field of imageFields) {
      const fileData = data[field];
      if (!fileData) continue;

      let normalized = fileData as string;
      if (
        typeof normalized === "string" &&
        !normalized.startsWith("data:") &&
        !normalized.startsWith("http")
      ) {
        normalized = `data:${normalized}`;
      }

      // If it's already a URL, skip upload
      if (normalized.startsWith("http")) {
        docData[field] = normalized;
        continue;
      }

      // Upload via Next.js API
      const blob = dataURLtoBlob(normalized);
      const contentType = blob.type || "image/png";
      const extension = contentType.split("/")[1] || "png";
      const fileName = `${field}.${extension.replace("+", "_")}`;

      const url = await uploadImageViaAPI(
        normalized,
        fileName,
        data.slug || "event"
      );
      docData[field] = url;
    }

    // Add optional text fields
    if (data.loadingMessage !== undefined) {
      docData.loadingMessage = data.loadingMessage;
    }

    if (data.loadingSubtitle !== undefined) {
      docData.loadingSubtitle = data.loadingSubtitle;
    }

    if (data.loadingTitleColor !== undefined) {
      docData.loadingTitleColor = data.loadingTitleColor;
    }

    if (data.loadingSubtitleColor !== undefined) {
      docData.loadingSubtitleColor = data.loadingSubtitleColor;
    }

    if (data.splashTitle !== undefined) docData.splashTitle = data.splashTitle;
    if (data.splashTitleColor !== undefined) docData.splashTitleColor = data.splashTitleColor;
    if (data.splashSubtitle !== undefined) docData.splashSubtitle = data.splashSubtitle;
    if (data.splashSubtitleColor !== undefined) docData.splashSubtitleColor = data.splashSubtitleColor;
    if (data.splashWord1 !== undefined) docData.splashWord1 = data.splashWord1;
    if (data.splashWord1Color !== undefined) docData.splashWord1Color = data.splashWord1Color;
    if (data.splashWord2 !== undefined) docData.splashWord2 = data.splashWord2;
    if (data.splashWord2Color !== undefined) docData.splashWord2Color = data.splashWord2Color;
    if (data.splashLoaderColorFrom !== undefined) docData.splashLoaderColorFrom = data.splashLoaderColorFrom;
    if (data.splashLoaderColorTo !== undefined) docData.splashLoaderColorTo = data.splashLoaderColorTo;
    if (data.splashButtonText !== undefined) docData.splashButtonText = data.splashButtonText;
    if (data.splashButtonColorFrom !== undefined) docData.splashButtonColorFrom = data.splashButtonColorFrom;
    if (data.splashButtonColorTo !== undefined) docData.splashButtonColorTo = data.splashButtonColorTo;

    if (data.screenConfig !== undefined) {
      docData.screenConfig = data.screenConfig;
    }

    if (data.paintTimeSeconds !== undefined) {
      docData.paintTimeSeconds = data.paintTimeSeconds;
    }

    const docRef = await addDoc(collection(db, COLLECTION), docData);
    return docRef.id;
  } catch (error) {
    console.error("Error creating event profile:", error);
    throw error;
  }
}

/**
 * Get all event profiles
 */
export async function getEventProfiles(): Promise<EventProfile[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as EventProfile[];
  } catch (error) {
    console.error("Error getting event profiles:", error);
    throw error;
  }
}

/**
 * Get active event profiles
 */
export async function getActiveEventProfiles(): Promise<EventProfile[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as EventProfile[];
  } catch (error) {
    console.error("Error getting active event profiles:", error);
    throw error;
  }
}

/**
 * Get event profile by ID
 */
export async function getEventProfileById(
  id: string
): Promise<EventProfile | null> {
  try {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as EventProfile;
  } catch (error) {
    console.error("Error getting event profile by ID:", error);
    throw error;
  }
}

/**
 * Get event profile by slug
 */
export async function getEventProfileBySlug(
  slug: string
): Promise<EventProfile | null> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("slug", "==", slug),
      where("isActive", "==", true)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as EventProfile;
  } catch (error) {
    console.error("Error getting event profile by slug:", error);
    throw error;
  }
}

/**
 * Update event profile
 */
export async function updateEventProfile(
  id: string,
  data: Partial<EventProfile & Record<string, any>>
): Promise<void> {
  try {
    const docData: Record<string, any> = {
      updatedAt: Timestamp.now(),
    };

    // Update simple fields
    if (data.name !== undefined) docData.name = data.name;
    if (data.description !== undefined) docData.description = data.description;
    if (data.slug !== undefined) docData.slug = data.slug;
    if (data.prompts !== undefined && Array.isArray(data.prompts)) {
      docData.prompts = data.prompts;
    }
    if (data.isActive !== undefined) docData.isActive = data.isActive;
    if (data.loadingMessage !== undefined) docData.loadingMessage = data.loadingMessage;
    if (data.loadingSubtitle !== undefined) docData.loadingSubtitle = data.loadingSubtitle;
    if (data.loadingTitleColor !== undefined) docData.loadingTitleColor = data.loadingTitleColor;
    if (data.loadingSubtitleColor !== undefined) docData.loadingSubtitleColor = data.loadingSubtitleColor;
    if (data.showLogosInLoader !== undefined) docData.showLogosInLoader = data.showLogosInLoader;
    if (data.enableFrame !== undefined) docData.enableFrame = data.enableFrame;
    if (data.dataProcessingText !== undefined) docData.dataProcessingText = data.dataProcessingText;
    if (data.generationType !== undefined) docData.generationType = data.generationType;
    if (data.buttonClickEffect !== undefined) docData.buttonClickEffect = data.buttonClickEffect;
    if (data.handCursorEnabled !== undefined) docData.handCursorEnabled = data.handCursorEnabled;
    if (data.handRevealEnabled !== undefined) docData.handRevealEnabled = data.handRevealEnabled;
    if (data.revealEffect !== undefined) docData.revealEffect = data.revealEffect;
    if (data.showSplashScreen !== undefined) docData.showSplashScreen = data.showSplashScreen;
    if (data.captureBeforeFilter !== undefined) docData.captureBeforeFilter = data.captureBeforeFilter;
    if (data.captureViewStyle !== undefined) docData.captureViewStyle = data.captureViewStyle;
    if (data.imageCustomizationEnabled !== undefined) docData.imageCustomizationEnabled = data.imageCustomizationEnabled;
    if (data.backgroundAnimation !== undefined) docData.backgroundAnimation = data.backgroundAnimation;
    if (data.screenConfig !== undefined) docData.screenConfig = data.screenConfig;
    if (data.splashTitle !== undefined) docData.splashTitle = data.splashTitle;
    if (data.splashTitleColor !== undefined) docData.splashTitleColor = data.splashTitleColor;
    if (data.splashSubtitle !== undefined) docData.splashSubtitle = data.splashSubtitle;
    if (data.splashSubtitleColor !== undefined) docData.splashSubtitleColor = data.splashSubtitleColor;
    if (data.splashWord1 !== undefined) docData.splashWord1 = data.splashWord1;
    if (data.splashWord1Color !== undefined) docData.splashWord1Color = data.splashWord1Color;
    if (data.splashWord2 !== undefined) docData.splashWord2 = data.splashWord2;
    if (data.splashWord2Color !== undefined) docData.splashWord2Color = data.splashWord2Color;
    if (data.splashLoaderColorFrom !== undefined) docData.splashLoaderColorFrom = data.splashLoaderColorFrom;
    if (data.splashLoaderColorTo !== undefined) docData.splashLoaderColorTo = data.splashLoaderColorTo;
    if (data.splashButtonText !== undefined) docData.splashButtonText = data.splashButtonText;
    if (data.splashButtonColorFrom !== undefined) docData.splashButtonColorFrom = data.splashButtonColorFrom;
    if (data.splashButtonColorTo !== undefined) docData.splashButtonColorTo = data.splashButtonColorTo;

    // Process image fields
    // "imageFields": el mismo mecanismo genérico (por content-type) también
    // sirve para subir el video del screensaver.
    const imageFields = ["bgImage", "logoTop", "logoBottom", "frameImage", "buttonImage", "loadingPageImage", "loadingMediaUrl", "splashImage", "screenSaverVideoUrl", "splashCardImage"];
    for (const field of imageFields) {
      const fileData = data[field];
      if (!fileData) continue;

      let normalized = fileData as string;
      if (
        typeof normalized === "string" &&
        !normalized.startsWith("data:") &&
        !normalized.startsWith("http")
      ) {
        normalized = `data:${normalized}`;
      }

      // If it's already a URL, skip upload
      if (normalized.startsWith("http")) {
        docData[field] = normalized;
        continue;
      }

      // Upload via Next.js API
      const blob = dataURLtoBlob(normalized);
      const contentType = blob.type || "image/png";
      const extension = contentType.split("/")[1] || "png";
      const fileName = `${field}.${extension.replace("+", "_")}`;

      const url = await uploadImageViaAPI(
        normalized,
        fileName,
        data.slug || "event"
      );
      docData[field] = url;
    }

    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, docData);
  } catch (error) {
    console.error("Error updating event profile:", error);
    throw error;
  }
}

/**
 * Delete event profile
 */
export async function deleteEventProfile(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting event profile:", error);
    throw error;
  }
}

/**
 * Generate share URL for an event
 */
export function generateEventUrl(
  baseUrl: string,
  slug: string
): string {
  return `${baseUrl}/booth/${slug}`;
}

/**
 * Get recent events (last N events)
 */
export async function getRecentEvents(limit: number = 5): Promise<EventProfile[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    const events = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as EventProfile[];
    
    return events.slice(0, limit);
  } catch (error) {
    console.error("Error getting recent events:", error);
    throw error;
  }
}

/**
 * Search events by name or slug
 */
export async function searchEvents(searchTerm: string): Promise<EventProfile[]> {
  try {
    if (!searchTerm.trim()) return [];
    
    const snapshot = await getDocs(
      query(collection(db, COLLECTION), orderBy("createdAt", "desc"))
    );
    
    const allEvents = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as EventProfile[];
    
    const search = searchTerm.toLowerCase();
    return allEvents.filter(
      (event) =>
        event.name.toLowerCase().includes(search) ||
        event.slug.toLowerCase().includes(search)
    );
  } catch (error) {
    console.error("Error searching events:", error);
    throw error;
  }
}
