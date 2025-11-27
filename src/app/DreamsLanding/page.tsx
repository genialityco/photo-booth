/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ====== Config ======
const CF_URL =
  process.env.NEXT_PUBLIC_CF_TEXT2IMG ??
  "https://us-central1-lenovo-experiences.cloudfunctions.net/generateImageFromText";

// Mantengo tu helper tal cual pero SIN export para no romper el Page type
async function generateImageFromText(
  text: string,
  opts?: { size?: "256x256" | "512x512" | "1024x1024"; signal?: AbortSignal }
): Promise<string> {
  if (!text?.trim()) throw new Error("Falta el texto");

  const r = await fetch(CF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.trim(),
      size: opts?.size ?? "1024x1024", // siempre cuadrada
    }),
    signal: opts?.signal,
  });

  const data = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
  if (!data?.url) throw new Error("La respuesta no contiene URL");

  return String(data.url);
}

// ====== Helpers ======
function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ====== Componente interno que usa useSearchParams ======
function ImageFromTextContent() {
  const router = useRouter();
  const sp = useSearchParams();

  // 1) Si ?text tiene < 2 palabras, no autogenerar: initialText = ""
  const rawText = (sp.get("text") || "").trim();
  const initialText = countWords(rawText) < 2 ? "" : rawText;

  // puedes seguir leyendo size de la URL, pero enviaremos 1024x1024 por defecto
  const initialSize =
    (sp.get("size") as "256x256" | "512x512" | "1024x1024") ?? "1024x1024";

  const [text, setText] = React.useState(initialText);
  const [size] = React.useState<"256x256" | "512x512" | "1024x1024">(
    initialSize
  );
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const controllerRef = React.useRef<AbortController | null>(null);

  // NEW: si hay error, también mostramos el input (además del caso de texto vacío)
  const showInput = !initialText || !!error;

  // Dispara automáticamente si llega ?text= y NO es corto
  React.useEffect(() => {
    if (!initialText) return; // si era 1 palabra, no auto-ejecuta
    void handleGenerate(initialText, initialSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText, initialSize]);

  async function handleGenerate(t?: string, s?: typeof size) {
    const theText = (t ?? text).trim();
    const theSize = s ?? size;

    if (!theText) {
      setError("Agrega el parámetro ?text= en la URL o escribe un prompt.");
      return;
    }

    // 2) Si el texto tiene < 2 palabras, reescribir el prompt:
    const words = countWords(theText);
    const craftedPrompt =
      words < 2
        ? `Realiza ${theText} en forma que parezca un cuadro donde se está soñando`
        : theText;

    setLoading(true);
    setError(null);
    setImgUrl(null);

    try {
      controllerRef.current?.abort();
      controllerRef.current = new AbortController();
      const url = await generateImageFromText(craftedPrompt, {
        size: theSize,
        signal: controllerRef.current.signal,
      });
      setImgUrl(url);

      // Mantén URL canónica (con el texto original ingresado por el usuario)
      const q = new URLSearchParams({ text: theText, size: theSize });
      router.replace(`?${q.toString()}`);
    } catch (e: any) {
      setError(e?.message || "Error al generar la imagen");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!imgUrl) return;
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = "generated-image.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 flex flex-col">
      {/* MAIN */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="space-y-4 bg-white shadow-sm rounded-2xl p-4 md:p-6">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {initialText && !imgUrl && !error && (
              <div className="text-base md:text-lg text-gray-600 text-center">
                <h1 className="font-semibold">Estamos generando tu sueño</h1>
              </div>
            )}

            {imgUrl && (
              <div className="mt-4 flex flex-col items-center text-center gap-4">
                <h1 className="font-bold text-2xl md:text-3xl">
                  Tu sueño se ha generado
                </h1>

                <div className="relative mx-auto w-80 md:w-96 aspect-square rounded-2xl overflow-hidden border border-gray-200 bg-white">
                  <img
                    src={imgUrl}
                    alt="Imagen generada"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center justify-center rounded-2xl px-5 py-2.5 bg-gray-900 text-white hover:bg-black text-base md:text-lg"
                  >
                    Descargar PNG
                  </button>

                  <a
                    href={imgUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl px-5 py-2.5 border border-gray-300 hover:bg-gray-100 text-base md:text-lg"
                  >
                    Abrir en nueva pestaña
                  </a>
                </div>
              </div>
            )}

            {/* NEW: mostramos el input si no hay texto inicial o si hubo error */}
            {showInput && (
              <div className="text-sm md:text-base text-gray-700 mt-2">
                <label className="block mb-1 font-medium">
                  Ingresa tu sueño para convertirlo en imagen
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ingresa tu sueño para convertirlo en imagen"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button
                    onClick={() => handleGenerate()}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-2xl px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {loading ? "Generando..." : "Generar foto"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Tip: si escribes una sola palabra (p. ej. "gato"), lo
                  interpretaré como:{" "}
                  <em>
                    "Realiza gato en forma que parezca un cuadro donde se está
                    soñando"
                  </em>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* FOOTER: SOLO LA IMAGEN dentro de un contenedor pequeño */}
      <footer className="w-full mt-auto border-t bg-white">
        <div className="mx-auto px-4 py-4 w-56 md:w-72">
          <img
            src="/cabecera.jpg"
            alt="Footer"
            className="block w-full h-auto object-contain"
          />
        </div>
      </footer>
    </div>
  );
}

// ====== Página/Componente de Landing (wrapped in Suspense) ======
export default function ImageFromTextLanding() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center">
          <div className="text-gray-600">Cargando...</div>
        </div>
      }
    >
      <ImageFromTextContent />
    </Suspense>
  );
}
