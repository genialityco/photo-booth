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

/**
 * Un logo posicionado libremente dentro del header configurable de la splash
 * (ver `splashHeaderLogos` en `EventProfile`). Coordenadas y ancho en % del
 * área del header (no de la pantalla completa), para que la posición escale
 * igual sin importar el tamaño real de pantalla.
 */
export type SplashHeaderLogo = {
  id: string;
  url: string;
  xPct: number;
  yPct: number;
  widthPct: number;
};

/** Los elementos de la splash (fuera del fondo) que se pueden reposicionar/
 * redimensionar libremente cuando `splashFreeLayoutEnabled` está activo. Ver
 * `splashLayout` en `EventProfile`. "logo" es el logo único (`logoTop`), solo
 * relevante cuando el evento NO tiene varios logos en `splashHeaderLogos` —
 * en ese caso cada logo del header tiene su propia posición libre en
 * `splashLayout.logos` (ver más abajo), no bajo "logo". */
export type SplashFreeElementKind =
  | "logo"
  | "title"
  | "subtitle"
  | "word1"
  | "word2"
  | "card"
  | "bar"
  | "button";

/**
 * Posición/tamaño de un elemento en el layout libre de la splash. `xPct`/`yPct`
 * ubican la esquina superior izquierda del elemento en % de la pantalla
 * completa; `scalePct` lo escala como un todo (100 = tamaño original).
 */
export type SplashFreeElement = {
  xPct: number;
  yPct: number;
  scalePct: number;
};

export type SplashLayout = Partial<Record<SplashFreeElementKind, SplashFreeElement>> & {
  /**
   * Posición/escala libre de cada logo del header (clave = `SplashHeaderLogo.id`),
   * usada solo en modo libre. Independiente de `xPct/yPct/widthPct` en
   * `splashHeaderLogos`, que siguen describiendo la posición dentro de la
   * franja del header cuando el modo libre está desactivado.
   */
  logos?: Record<string, SplashFreeElement>;
};

export type EventProfile = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  bgImage?: string;
  logoTop?: string;
  logoBottom?: string;
  /**
   * Tamaño del logo superior, en % del tamaño base (100 = el de siempre).
   * Aplica al header del wizard (preview, resultado, revelado) y al logo
   * izquierdo de la pantalla de carga. Se acota entre 50 y 250 al renderizar
   * — ver `clampLogoScale` en components/photo-booth/logoBarSizing.ts. Por
   * compatibilidad, los eventos sin este campo usan 100.
   */
  logoTopScalePct?: number;
  /** Igual que `logoTopScalePct`, para el logo inferior (footer del wizard y
   * logo derecho de la pantalla de carga). */
  logoBottomScalePct?: number;
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
  /** Color (hex) del anillo/barra de progreso de la pantalla de carga. Default "#ef4444". */
  loadingProgressColor?: string;
  /** Color (hex, admite alpha vía rgba/hex8) del track de fondo del anillo —
   * la parte AÚN NO rellenada de la barra. Default "rgba(0,0,0,0.15)". */
  loadingProgressTrackColor?: string;
  /** Color (hex) del número de porcentaje dentro del anillo. Default "#000000". */
  loadingPercentColor?: string;
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
   * (descubre la foto de un velo sólido), el mismo rodillo pero arrancando
   * la foto en blanco y negro y pintando el color al pasarlo, o un rodillo
   * REAL detectado por un Kinect apuntando a la pantalla gigante (pantalla
   * espejo) - en ese caso el tablet no revela nada por sí mismo, solo
   * espera a que la pantalla espejo reporte que terminó (ver
   * useBoothLiveSession.revealedTaskId / kinect-roller-backend/). Por
   * compatibilidad, los eventos sin este campo se comportan como
   * "HAND_WIPE" (comportamiento original).
   */
  revealEffect?: "NONE" | "HAND_WIPE" | "ROLLER" | "ROLLER_COLOR" | "KINECT_ROLLER";
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
   * Segundos de inactividad antes de mostrar el ScreenSaver. Sin este campo,
   * se mantienen los 150s (2.5min) originales.
   */
  screenSaverInactivityTimeoutSec?: number;
  /**
   * Segundos que dura cada pantalla del loop del ScreenSaver (media → splash
   * → galería → filtros) antes de pasar a la siguiente. Default: 10.
   */
  screenSaverSlideDurationSec?: number;
  /**
   * Cadencia (segundos) del crossfade interno de la pantalla de galería del
   * ScreenSaver, entre una foto generada y la siguiente. Default: 4.
   */
  screenSaverGalleryPhotoIntervalSec?: number;
  /**
   * Interruptores por tipo de pantalla del loop del ScreenSaver — cada una se
   * incluye automáticamente si hay contenido disponible (ver ScreenSaverSlideshow),
   * pero puede forzarse apagada acá aunque haya contenido. Por compatibilidad,
   * sin estos campos las 4 quedan activas (comportamiento por defecto).
   */
  screenSaverMediaSlideEnabled?: boolean;
  screenSaverSplashSlideEnabled?: boolean;
  screenSaverGallerySlideEnabled?: boolean;
  screenSaverFiltersSlideEnabled?: boolean;
  /**
   * Pantalla de "carpeta de fotos" (`ScreenSaverPhotoFolder`): secuencia de
   * motion graphics sobre fondo claro — una carpeta 3D que un cursor abre,
   * de la que sale una pila de fotos del evento que se van pasando como
   * tarjetas, y que cierra con el logo del evento.
   *
   * A diferencia de las cuatro de arriba, esta arranca APAGADA por defecto
   * (se lee como `=== true`, no como `!== false`): es una pantalla nueva y
   * meterla sola en la rotación de todos los eventos ya existentes les
   * cambiaría el screensaver sin que nadie lo haya pedido.
   */
  screenSaverFolderSlideEnabled?: boolean;
  /**
   * QUÉ animación corre en ese turno del loop. El interruptor de arriba decide
   * si la pantalla animada entra en la rotación; este campo, cuál de las
   * animaciones se ve:
   *
   * - `FOLDER`: la carpeta de fotos (`ScreenSaverPhotoFolder`), sobre fondo
   *   claro, con etiqueta y logo de cierre.
   * - `EDITORIAL`: el tablero editorial (`ScreenSaverEditorialGrid`), sobre
   *   fondo negro, con las fotos en cuadrícula tipo Pinterest subiendo con
   *   paralaje y textos fijos en los bordes.
   *
   * Sin este campo se asume `FOLDER`: es la que ya tenían configurada los
   * eventos que activaron la pantalla antes de que existiera la editorial.
   */
  screenSaverAnimationType?: "FOLDER" | "EDITORIAL";
  /**
   * Textos fijos de los bordes de la animación editorial. Los que queden
   * vacíos no se muestran (y si no hay ninguno, la franja entera desaparece):
   * el tablero se ve sin texto en vez de con un texto de ejemplo.
   */
  screenSaverEditorialTexts?: {
    topLeft?: string;
    topCenter?: string;
    topRight?: string;
    bottomLeft?: string;
    bottomCenter?: string;
    bottomRight?: string;
  };
  /**
   * Texto de la etiqueta de la carpeta (el "Important Folder" del original).
   * Sin este campo se usa el nombre del evento. Solo aplica a la animación
   * `FOLDER`.
   */
  screenSaverFolderLabel?: string;
  /**
   * Logo del cierre de esa secuencia. Sin este campo se usa `logoTop` (el
   * logo superior del evento), que es lo que hacía siempre: existe para poder
   * cerrar con una versión distinta —normalmente el logo en positivo sobre
   * claro, ya que esta pantalla va sobre fondo blanco y el `logoTop` de
   * varios eventos está pensado para fondo oscuro.
   */
  screenSaverFolderLogo?: string;
  /**
   * Contenido configurable de la pantalla de splash inicial (independiente
   * de `splashImage`/`screenSaverVideoUrl`, que son solo del ScreenSaver).
   * El fondo y el logo superior de esta pantalla reutilizan `bgImage` y
   * `logoTop`. Todos estos campos son opcionales: sin configurar, el
   * componente aplica los valores por defecto de la campaña de referencia
   * ("Tu rostro, tu arte").
   */
  /**
   * Header configurable de la splash: reemplaza el logo único de arriba
   * (`logoTop`) por N logos posicionados y redimensionados libremente dentro
   * de una franja superior de alto `splashHeaderHeightPct` (% del alto de
   * pantalla). Sin `splashHeaderLogos` (o array vacío), la splash sigue
   * mostrando el logo único de siempre (comportamiento original).
   */
  splashHeaderHeightPct?: number;
  splashHeaderLogos?: SplashHeaderLogo[];
  /**
   * Layout libre: cuando `splashFreeLayoutEnabled` es true, título, subtítulo,
   * palabra 1/2, tarjeta, barra de carga y botón se posicionan/escalan según
   * `splashLayout` en vez del grid responsivo de siempre. Sin este campo (o
   * en false), la splash sigue usando el grid original sin cambios. El header
   * de logos y el fondo NO forman parte del layout libre (siguen igual).
   */
  splashFreeLayoutEnabled?: boolean;
  splashLayout?: SplashLayout;
  splashTitle?: string;
  splashTitleColor?: string;
  /**
   * "TEXT" (o sin este campo) = título animado con `splashTitle`/`splashTitleColor`/
   * `splashTitleFont` (comportamiento original). "IMAGE" = reemplaza el título por
   * `splashTitleImage`; si no hay imagen cargada, se usa el texto igual como respaldo.
   */
  splashTitleMode?: "TEXT" | "IMAGE";
  splashTitleImage?: string;
  /**
   * Inclinación (grados) del título de texto (`splashTitleMode !== "IMAGE"`) —
   * el look "cursiva"/inclinado hacia la derecha era un `skewX` fijo en -9°.
   * 0 = sin inclinar. Por compatibilidad, los eventos sin este campo
   * mantienen -9 (comportamiento original).
   */
  splashTitleSkewDeg?: number;
  /**
   * Mostrar el título de la splash en mayúsculas. Ojo con la asimetría
   * respecto de `splashSubtitleUppercase`: el título NUNCA estuvo forzado a
   * mayúsculas, se mostraba tal cual se escribía. Por eso acá el default es
   * `false` y se lee como `=== true` — si arrancara activo, un título
   * deliberadamente en minúsculas (ej. "Desaparece sin dejar huella") pasaría
   * a gritar en mayúsculas solo por agregar el campo. En los dos casos la
   * regla de fondo es la misma: no cambiarle el look a un evento ya creado.
   * Solo aplica al título de TEXTO, no al modo imagen (`splashTitleMode`).
   */
  splashTitleUppercase?: boolean;
  splashSubtitle?: string;
  splashSubtitleColor?: string;
  /**
   * Mostrar el subtítulo de la splash en mayúsculas. El subtítulo iba forzado
   * a mayúsculas por código, así que el default es `true` para no cambiarle el
   * look a los eventos que ya existen: solo un `false` explícito lo respeta
   * literal, tal cual se escribió en el admin. Se lee siempre como
   * `!== false`, nunca como `=== true`.
   */
  splashSubtitleUppercase?: boolean;
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
   * Fuente independiente por texto de la splash inicial ("anton" | "barlow" |
   * "azo" | "selima"). Sin alguno de estos campos (o valor "default"), ese
   * texto mantiene la fuente original: Anton para título/palabras, Barlow
   * Condensed para subtítulo.
   */
  splashTitleFont?: string;
  splashSubtitleFont?: string;
  /** Aplica en conjunto a splashWord1 y splashWord2. */
  splashWordsFont?: string;
  /**
   * Negrita del título de la splash. El título nunca fijó un peso (usaba el
   * propio de la fuente), así que el default es `false` — solo un `true`
   * explícito lo pone en negrita. Se lee como `=== true`.
   */
  splashTitleBold?: boolean;
  /**
   * Negrita del subtítulo. Acá es al revés que en el título: el subtítulo iba
   * con `font-weight: 800` fijo por código, así que el default es `true` para
   * no cambiarle el look a los eventos existentes — se lee como `!== false`.
   *
   * Desactivarlo importa de verdad con fuentes que traen un solo peso (Anton,
   * Selima): forzarles 800 hace que el navegador sintetice la negrita (faux
   * bold) y la fuente elegida se vea deformada, como si no se hubiera
   * aplicado.
   */
  splashSubtitleBold?: boolean;
  /**
   * Si está activado y `splashVideoUrl` está configurado, la splash inicial
   * reemplaza toda la coreografía animada (logo, título, subtítulo, tarjeta,
   * palabras) por un video de fondo en loop; la barra de carga y el botón
   * "Comenzar" (con sus colores/texto configurados arriba) se mantienen
   * superpuestos como pie de página sobre el video. Por compatibilidad, los
   * eventos sin este campo mantienen la animación CSS (comportamiento
   * original).
   */
  splashUseVideo?: boolean;
  /** Video en loop para el fondo de la splash inicial (ver splashUseVideo). */
  splashVideoUrl?: string;
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
   * "Modo ahorro de datos": para sedes con wifi malo. Apaga de un solo lugar
   * todo lo que pesa en red durante la sesión — el revelado con rodillo y sus
   * ~49 MB de modelos ONNX, MediaPipe para las manos (~20 MB), los videos de
   * fondo/salvapantallas — y baja la resolución de la foto que se sube; de
   * paso apaga las animaciones, que no gastan red pero traban las tablets.
   * Se puede forzar en sitio con `?lite=1` o con el botón discreto de la
   * pantalla del booth, sin tocar el evento. Ver
   * components/photo-booth/lowBandwidthMode.ts, que es donde vive el detalle
   * de qué apaga cada cosa. Por compatibilidad, los eventos sin este campo lo
   * tienen apagado.
   */
  lowBandwidthMode?: boolean;
  /**
   * Tiempo máximo (segundos) que se le da a la persona para "pintar"/revelar
   * la foto (borrar el velo con la mano o el rodillo) antes de avanzar
   * automáticamente al resultado. Por compatibilidad, los eventos sin este
   * campo usan 28 segundos (comportamiento original).
   */
  paintTimeSeconds?: number;
  /**
   * Relación de aspecto de la foto capturada/generada. "SQUARE" (o sin
   * configurar) es el comportamiento original (1:1). "3:4" es para eventos
   * que imprimen con una Canon Selphy CP1500 — afecta la captura, lo que se
   * envía a la IA, el revelado y la descarga/impresión final.
   */
  photoAspectRatio?: "SQUARE" | "3:4";
  /**
   * Si una segunda pestaña/dispositivo abre la misma URL de `/booth/[slug]`
   * mientras otra ya está activa, se convierte automáticamente en "pantalla
   * espejo" pasiva (sincronizada en tiempo real vía `boothLiveSessions`, ver
   * `useBoothLiveSession`). Por compatibilidad, los eventos sin este campo
   * mantienen ese comportamiento (default true). Si se desactiva, cada
   * pestaña/dispositivo funciona de forma independiente como booth
   * interactivo normal, sin detectar ni reflejar a otras.
   */
  mirrorScreenEnabled?: boolean;
  /**
   * Logo de auspiciante/marca del evento, dibujado en la esquina superior
   * izquierda de la foto RESULTANTE (composeFramedImage.ts) — se ve tanto al
   * mostrar el resultado (ResultStep) como al descargarla/imprimirla, ya que
   * las tres rutas comparten esa misma composición en canvas. Distinto de
   * `logoTop`/`logoBottom` (esos son para el header del wizard durante la
   * captura, no quedan "quemados" en la foto final). Opcional: sin este
   * campo no se dibuja nada (comportamiento original).
   */
  brandingLogoUrl?: string;
  /**
   * Texto centrado en la parte inferior de la foto RESULTANTE (mismo
   * mecanismo que brandingLogoUrl, ver ahí). Soporta múltiples líneas
   * separadas por "\n" (ej. sitio web en una línea, contacto en la
   * siguiente). Opcional: sin este campo no se dibuja nada.
   */
  brandingFooterText?: string;
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
 * Sube cualquier logo del header cuya `url` sea todavía un data: URL (recién
 * elegido en el editor) y devuelve el array con las URLs ya hospedadas. Los
 * que ya son `http...` (reusados de otro campo de imagen del evento, o de un
 * guardado previo) se dejan tal cual, sin volver a subir.
 */
async function resolveHeaderLogos(
  logos: SplashHeaderLogo[] | undefined,
  eventSlug: string | undefined
): Promise<SplashHeaderLogo[] | undefined> {
  if (!logos) return undefined;

  const resolved: SplashHeaderLogo[] = [];
  for (const logo of logos) {
    let url = logo.url;
    if (url && !url.startsWith("http")) {
      const normalized = url.startsWith("data:") ? url : `data:${url}`;
      const blob = dataURLtoBlob(normalized);
      const contentType = blob.type || "image/png";
      const extension = contentType.split("/")[1]?.replace("+", "_") || "png";
      url = await uploadImageViaAPI(
        normalized,
        `splashHeaderLogo_${logo.id}.${extension}`,
        eventSlug || "event"
      );
    }
    resolved.push({ ...logo, url });
  }
  return resolved;
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
      splashUseVideo: data.splashUseVideo === true,
      captureBeforeFilter: data.captureBeforeFilter === true,
      captureViewStyle: data.captureViewStyle || "CLASSIC",
      imageCustomizationEnabled: data.imageCustomizationEnabled === true,
      backgroundAnimation: data.backgroundAnimation || "NONE",
      lowBandwidthMode: data.lowBandwidthMode === true,
      mirrorScreenEnabled: data.mirrorScreenEnabled !== false,
      screenSaverMediaSlideEnabled: data.screenSaverMediaSlideEnabled !== false,
      screenSaverSplashSlideEnabled: data.screenSaverSplashSlideEnabled !== false,
      screenSaverGallerySlideEnabled: data.screenSaverGallerySlideEnabled !== false,
      screenSaverFiltersSlideEnabled: data.screenSaverFiltersSlideEnabled !== false,
      screenSaverFolderSlideEnabled: data.screenSaverFolderSlideEnabled === true,
      screenSaverAnimationType: data.screenSaverAnimationType || "FOLDER",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Image fields to process
    // "imageFields": el mismo mecanismo genérico (por content-type) también
    // sirve para subir el video del screensaver.
    const imageFields = ["bgImage", "logoTop", "logoBottom", "frameImage", "buttonImage", "loadingPageImage", "loadingMediaUrl", "splashImage", "screenSaverVideoUrl", "splashCardImage", "splashTitleImage", "splashVideoUrl", "brandingLogoUrl", "screenSaverFolderLogo"];

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

    if (data.loadingProgressColor !== undefined) {
      docData.loadingProgressColor = data.loadingProgressColor;
    }

    if (data.loadingProgressTrackColor !== undefined) {
      docData.loadingProgressTrackColor = data.loadingProgressTrackColor;
    }

    if (data.loadingPercentColor !== undefined) {
      docData.loadingPercentColor = data.loadingPercentColor;
    }

    if (data.splashTitle !== undefined) docData.splashTitle = data.splashTitle;
    if (data.splashTitleColor !== undefined) docData.splashTitleColor = data.splashTitleColor;
    if (data.splashTitleMode !== undefined) docData.splashTitleMode = data.splashTitleMode;
    if (data.splashTitleSkewDeg !== undefined) docData.splashTitleSkewDeg = data.splashTitleSkewDeg;
    if (data.splashHeaderHeightPct !== undefined) docData.splashHeaderHeightPct = data.splashHeaderHeightPct;
    if (data.splashHeaderLogos !== undefined) {
      docData.splashHeaderLogos = await resolveHeaderLogos(data.splashHeaderLogos, data.slug);
    }
    if (data.splashFreeLayoutEnabled !== undefined) docData.splashFreeLayoutEnabled = data.splashFreeLayoutEnabled;
    if (data.splashLayout !== undefined) docData.splashLayout = data.splashLayout;
    if (data.splashTitleUppercase !== undefined) docData.splashTitleUppercase = data.splashTitleUppercase;
    if (data.splashSubtitle !== undefined) docData.splashSubtitle = data.splashSubtitle;
    if (data.splashSubtitleColor !== undefined) docData.splashSubtitleColor = data.splashSubtitleColor;
    if (data.splashSubtitleUppercase !== undefined) docData.splashSubtitleUppercase = data.splashSubtitleUppercase;
    if (data.splashWord1 !== undefined) docData.splashWord1 = data.splashWord1;
    if (data.splashWord1Color !== undefined) docData.splashWord1Color = data.splashWord1Color;
    if (data.splashWord2 !== undefined) docData.splashWord2 = data.splashWord2;
    if (data.splashWord2Color !== undefined) docData.splashWord2Color = data.splashWord2Color;
    if (data.splashLoaderColorFrom !== undefined) docData.splashLoaderColorFrom = data.splashLoaderColorFrom;
    if (data.splashLoaderColorTo !== undefined) docData.splashLoaderColorTo = data.splashLoaderColorTo;
    if (data.splashButtonText !== undefined) docData.splashButtonText = data.splashButtonText;
    if (data.splashButtonColorFrom !== undefined) docData.splashButtonColorFrom = data.splashButtonColorFrom;
    if (data.splashButtonColorTo !== undefined) docData.splashButtonColorTo = data.splashButtonColorTo;
    if (data.splashTitleFont !== undefined) docData.splashTitleFont = data.splashTitleFont;
    if (data.splashSubtitleFont !== undefined) docData.splashSubtitleFont = data.splashSubtitleFont;
    if (data.splashWordsFont !== undefined) docData.splashWordsFont = data.splashWordsFont;
    if (data.splashTitleBold !== undefined) docData.splashTitleBold = data.splashTitleBold;
    if (data.splashSubtitleBold !== undefined) docData.splashSubtitleBold = data.splashSubtitleBold;

    if (data.screenConfig !== undefined) {
      docData.screenConfig = data.screenConfig;
    }

    if (data.paintTimeSeconds !== undefined) {
      docData.paintTimeSeconds = data.paintTimeSeconds;
    }

    if (data.screenSaverInactivityTimeoutSec !== undefined) {
      docData.screenSaverInactivityTimeoutSec = data.screenSaverInactivityTimeoutSec;
    }

    if (data.screenSaverSlideDurationSec !== undefined) {
      docData.screenSaverSlideDurationSec = data.screenSaverSlideDurationSec;
    }

    if (data.screenSaverGalleryPhotoIntervalSec !== undefined) {
      docData.screenSaverGalleryPhotoIntervalSec = data.screenSaverGalleryPhotoIntervalSec;
    }
    if (data.screenSaverFolderLabel !== undefined) {
      docData.screenSaverFolderLabel = data.screenSaverFolderLabel;
    }
    if (data.screenSaverFolderLogo !== undefined) {
      docData.screenSaverFolderLogo = data.screenSaverFolderLogo;
    }
    if (data.screenSaverEditorialTexts !== undefined) {
      docData.screenSaverEditorialTexts = data.screenSaverEditorialTexts;
    }

    if (data.photoAspectRatio !== undefined) {
      docData.photoAspectRatio = data.photoAspectRatio;
    }

    if (data.brandingFooterText !== undefined) {
      docData.brandingFooterText = data.brandingFooterText;
    }

    if (data.logoTopScalePct !== undefined) {
      docData.logoTopScalePct = data.logoTopScalePct;
    }

    if (data.logoBottomScalePct !== undefined) {
      docData.logoBottomScalePct = data.logoBottomScalePct;
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
    if (data.loadingProgressColor !== undefined) docData.loadingProgressColor = data.loadingProgressColor;
    if (data.loadingProgressTrackColor !== undefined) docData.loadingProgressTrackColor = data.loadingProgressTrackColor;
    if (data.loadingPercentColor !== undefined) docData.loadingPercentColor = data.loadingPercentColor;
    if (data.showLogosInLoader !== undefined) docData.showLogosInLoader = data.showLogosInLoader;
    if (data.enableFrame !== undefined) docData.enableFrame = data.enableFrame;
    if (data.dataProcessingText !== undefined) docData.dataProcessingText = data.dataProcessingText;
    if (data.generationType !== undefined) docData.generationType = data.generationType;
    if (data.buttonClickEffect !== undefined) docData.buttonClickEffect = data.buttonClickEffect;
    if (data.handCursorEnabled !== undefined) docData.handCursorEnabled = data.handCursorEnabled;
    if (data.handRevealEnabled !== undefined) docData.handRevealEnabled = data.handRevealEnabled;
    if (data.revealEffect !== undefined) docData.revealEffect = data.revealEffect;
    if (data.showSplashScreen !== undefined) docData.showSplashScreen = data.showSplashScreen;
    if (data.splashUseVideo !== undefined) docData.splashUseVideo = data.splashUseVideo;
    if (data.captureBeforeFilter !== undefined) docData.captureBeforeFilter = data.captureBeforeFilter;
    if (data.captureViewStyle !== undefined) docData.captureViewStyle = data.captureViewStyle;
    if (data.imageCustomizationEnabled !== undefined) docData.imageCustomizationEnabled = data.imageCustomizationEnabled;
    if (data.backgroundAnimation !== undefined) docData.backgroundAnimation = data.backgroundAnimation;
    if (data.lowBandwidthMode !== undefined) docData.lowBandwidthMode = data.lowBandwidthMode;
    if (data.paintTimeSeconds !== undefined) docData.paintTimeSeconds = data.paintTimeSeconds;
    if (data.photoAspectRatio !== undefined) docData.photoAspectRatio = data.photoAspectRatio;
    if (data.logoTopScalePct !== undefined) docData.logoTopScalePct = data.logoTopScalePct;
    if (data.logoBottomScalePct !== undefined) docData.logoBottomScalePct = data.logoBottomScalePct;
    if (data.mirrorScreenEnabled !== undefined) docData.mirrorScreenEnabled = data.mirrorScreenEnabled;
    if (data.screenSaverInactivityTimeoutSec !== undefined) docData.screenSaverInactivityTimeoutSec = data.screenSaverInactivityTimeoutSec;
    if (data.screenSaverSlideDurationSec !== undefined) docData.screenSaverSlideDurationSec = data.screenSaverSlideDurationSec;
    if (data.screenSaverGalleryPhotoIntervalSec !== undefined) docData.screenSaverGalleryPhotoIntervalSec = data.screenSaverGalleryPhotoIntervalSec;
    if (data.screenSaverMediaSlideEnabled !== undefined) docData.screenSaverMediaSlideEnabled = data.screenSaverMediaSlideEnabled;
    if (data.screenSaverSplashSlideEnabled !== undefined) docData.screenSaverSplashSlideEnabled = data.screenSaverSplashSlideEnabled;
    if (data.screenSaverGallerySlideEnabled !== undefined) docData.screenSaverGallerySlideEnabled = data.screenSaverGallerySlideEnabled;
    if (data.screenSaverFiltersSlideEnabled !== undefined) docData.screenSaverFiltersSlideEnabled = data.screenSaverFiltersSlideEnabled;
    if (data.screenSaverFolderSlideEnabled !== undefined) docData.screenSaverFolderSlideEnabled = data.screenSaverFolderSlideEnabled;
    if (data.screenSaverAnimationType !== undefined) docData.screenSaverAnimationType = data.screenSaverAnimationType;
    if (data.screenSaverFolderLabel !== undefined) docData.screenSaverFolderLabel = data.screenSaverFolderLabel;
    if (data.screenSaverFolderLogo !== undefined) docData.screenSaverFolderLogo = data.screenSaverFolderLogo;
    if (data.screenSaverEditorialTexts !== undefined) docData.screenSaverEditorialTexts = data.screenSaverEditorialTexts;
    if (data.screenConfig !== undefined) docData.screenConfig = data.screenConfig;
    if (data.splashTitle !== undefined) docData.splashTitle = data.splashTitle;
    if (data.splashTitleColor !== undefined) docData.splashTitleColor = data.splashTitleColor;
    if (data.splashTitleMode !== undefined) docData.splashTitleMode = data.splashTitleMode;
    if (data.splashTitleSkewDeg !== undefined) docData.splashTitleSkewDeg = data.splashTitleSkewDeg;
    if (data.splashHeaderHeightPct !== undefined) docData.splashHeaderHeightPct = data.splashHeaderHeightPct;
    if (data.splashHeaderLogos !== undefined) {
      docData.splashHeaderLogos = await resolveHeaderLogos(data.splashHeaderLogos, data.slug);
    }
    if (data.splashFreeLayoutEnabled !== undefined) docData.splashFreeLayoutEnabled = data.splashFreeLayoutEnabled;
    if (data.splashLayout !== undefined) docData.splashLayout = data.splashLayout;
    if (data.splashTitleUppercase !== undefined) docData.splashTitleUppercase = data.splashTitleUppercase;
    if (data.splashSubtitle !== undefined) docData.splashSubtitle = data.splashSubtitle;
    if (data.splashSubtitleColor !== undefined) docData.splashSubtitleColor = data.splashSubtitleColor;
    if (data.splashSubtitleUppercase !== undefined) docData.splashSubtitleUppercase = data.splashSubtitleUppercase;
    if (data.splashWord1 !== undefined) docData.splashWord1 = data.splashWord1;
    if (data.splashWord1Color !== undefined) docData.splashWord1Color = data.splashWord1Color;
    if (data.splashWord2 !== undefined) docData.splashWord2 = data.splashWord2;
    if (data.splashWord2Color !== undefined) docData.splashWord2Color = data.splashWord2Color;
    if (data.splashLoaderColorFrom !== undefined) docData.splashLoaderColorFrom = data.splashLoaderColorFrom;
    if (data.splashLoaderColorTo !== undefined) docData.splashLoaderColorTo = data.splashLoaderColorTo;
    if (data.splashButtonText !== undefined) docData.splashButtonText = data.splashButtonText;
    if (data.splashButtonColorFrom !== undefined) docData.splashButtonColorFrom = data.splashButtonColorFrom;
    if (data.splashButtonColorTo !== undefined) docData.splashButtonColorTo = data.splashButtonColorTo;
    if (data.splashTitleFont !== undefined) docData.splashTitleFont = data.splashTitleFont;
    if (data.splashSubtitleFont !== undefined) docData.splashSubtitleFont = data.splashSubtitleFont;
    if (data.splashWordsFont !== undefined) docData.splashWordsFont = data.splashWordsFont;
    if (data.splashTitleBold !== undefined) docData.splashTitleBold = data.splashTitleBold;
    if (data.splashSubtitleBold !== undefined) docData.splashSubtitleBold = data.splashSubtitleBold;

    // Process image fields
    // "imageFields": el mismo mecanismo genérico (por content-type) también
    // sirve para subir el video del screensaver.
    const imageFields = ["bgImage", "logoTop", "logoBottom", "frameImage", "buttonImage", "loadingPageImage", "loadingMediaUrl", "splashImage", "screenSaverVideoUrl", "splashCardImage", "splashTitleImage", "splashVideoUrl", "brandingLogoUrl", "screenSaverFolderLogo"];
    for (const field of imageFields) {
      const fileData = data[field];
      if (fileData === undefined) continue;
      if (!fileData) {
        // Campo explícitamente vaciado (ej. "Quitar Imagen"): hay que
        // escribir "" en Firestore, no solo omitirlo — updateDoc únicamente
        // toca los campos presentes en docData, así que omitirlo dejaría el
        // valor anterior intacto.
        docData[field] = "";
        continue;
      }

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
