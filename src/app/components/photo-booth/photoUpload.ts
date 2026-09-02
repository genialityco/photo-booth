/**
 * Subida de una foto (data URL) a Firebase Storage a través de
 * `/api/storage/upload`, con reintentos pensados para el wifi de un evento:
 * lento y con cortes, no simplemente caído.
 *
 * La versión anterior usaba `fetch` + `AbortController` con un timeout fijo
 * de 10 s por intento. Eso es un timeout de DURACIÓN TOTAL, y en el escenario
 * que se quería arreglar es contraproducente: un JPEG de ~400 KB viaja como
 * base64 dentro del JSON (+33% ≈ 540 KB) y sobre un enlace de 200-300 kbps de
 * subida tarda 15-20 s legítimamente. El abort lo mataba a los 10 s y
 * reiniciaba desde cero cinco veces, así que una red que funcionaba terminaba
 * en "Problemas de conexión".
 *
 * Acá el criterio es el estancamiento, no la duración: mientras el navegador
 * siga entregando bytes (`upload.onprogress`) el intento sigue vivo por lento
 * que sea, y solo se aborta si el enlace se queda mudo. Por eso se usa
 * XMLHttpRequest y no `fetch`: `fetch` no expone progreso de subida.
 */

/** Sin un solo byte de progreso durante este tiempo, el intento se da por
 * colgado. Es lo único que corta una subida en curso. */
const STALL_TIMEOUT_MS = 20_000;

/** Una vez enviado el cuerpo completo ya no hay eventos de progreso: el
 * servidor está reenviando la imagen a Storage. Esa espera tiene su propio
 * margen, más largo (incluye un posible cold start de la función). */
const SERVER_RESPONSE_TIMEOUT_MS = 60_000;

/** Red de seguridad por intento, por si el navegador reportara progreso en
 * un goteo infinito. */
const HARD_TIMEOUT_MS = 180_000;

const MAX_ATTEMPTS = 4;

export type UploadedPhoto = { url: string; path: string };

/** Error de subida que además dice si tiene sentido reintentar: un 4xx
 * (payload inválido, demasiado grande) no se arregla insistiendo. */
class UploadError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "UploadError";
    this.retryable = retryable;
  }
}

function uploadOnce(
  dataUrl: string,
  desiredPath: string,
  signal?: AbortSignal
): Promise<UploadedPhoto> {
  return new Promise<UploadedPhoto>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (hardTimer) clearTimeout(hardTimer);
      stallTimer = undefined;
      hardTimer = undefined;
      signal?.removeEventListener("abort", onExternalAbort);
    };

    const fail = (message: string, retryable = true) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        xhr.abort();
      } catch {
        /* ya terminado */
      }
      reject(new UploadError(message, retryable));
    };

    const succeed = (value: UploadedPhoto) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    /** Rearma el reloj de estancamiento. Se llama con cada señal de vida. */
    const armStall = (ms: number) => {
      if (settled) return;
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () => fail("La subida se quedó sin conexión"),
        ms
      );
    };

    const onExternalAbort = () => fail("Subida cancelada", false);

    if (signal?.aborted) {
      reject(new UploadError("Subida cancelada", false));
      return;
    }
    signal?.addEventListener("abort", onExternalAbort);

    hardTimer = setTimeout(() => fail("La subida tardó demasiado"), HARD_TIMEOUT_MS);
    armStall(STALL_TIMEOUT_MS);

    // Mientras salgan bytes, la subida está viva por lenta que vaya.
    xhr.upload.onprogress = () => armStall(STALL_TIMEOUT_MS);
    // Cuerpo enviado: ahora se espera al servidor, sin más eventos de
    // progreso hasta la respuesta.
    xhr.upload.onload = () => armStall(SERVER_RESPONSE_TIMEOUT_MS);
    xhr.onprogress = () => armStall(SERVER_RESPONSE_TIMEOUT_MS);

    xhr.onerror = () => fail("No se pudo conectar con el servidor");
    xhr.ontimeout = () => fail("La subida expiró");
    xhr.onabort = () => fail("Subida cancelada", false);

    xhr.onload = () => {
      // 4xx = problema del pedido (payload inválido/demasiado grande):
      // reintentar solo empeora la congestión. 408/429 sí son transitorios.
      const retryable =
        xhr.status < 400 || xhr.status >= 500 || xhr.status === 408 || xhr.status === 429;
      let parsed: { url?: string; path?: string; error?: string } = {};
      try {
        parsed = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* respuesta no-JSON (ej. HTML de error de la plataforma) */
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(parsed.error || `La subida falló (${xhr.status})`, retryable);
        return;
      }
      if (!parsed.url || !parsed.path) {
        fail("El servidor no devolvió la URL de la imagen");
        return;
      }
      succeed({ url: parsed.url, path: parsed.path });
    };

    xhr.open("POST", "/api/storage/upload");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ dataUrl, desiredPath }));
  });
}

/**
 * Sube un data URL con reintentos y backoff exponencial. Compartida entre la
 * subida temprana (apenas se captura, para que la pantalla espejo tenga algo
 * que mostrar) y `confirmAndProcess`, que reutiliza esa misma subida en vez
 * de repetirla.
 */
export async function uploadCapturedPhoto(
  dataUrl: string,
  desiredPath: string,
  options: { signal?: AbortSignal; maxAttempts?: number } = {}
): Promise<UploadedPhoto> {
  const { signal, maxAttempts = MAX_ATTEMPTS } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await uploadOnce(dataUrl, desiredPath, signal);
    } catch (e) {
      lastError = e;
      if (e instanceof UploadError && !e.retryable) throw e;
      if (signal?.aborted) throw e;
      if (attempt < maxAttempts - 1) {
        const delayMs = Math.min(1000 * 2 ** attempt, 8000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("La subida falló");
}
