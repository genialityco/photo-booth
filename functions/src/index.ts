// functions/src/index.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";

// Inicializa Admin SDK
initializeApp();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const db = getFirestore();

// === Goat Shot: paths ===
const OUTPUT_PREFIX = "goat-shot/outputs";

// Modelo base
const MODEL = "gpt-image-1";

/*
const BASE_PROMPT_quimicos = `Transform the uploaded photo of a person into a hyper-realistic, artistic portrait inspired by the history of pharmacy and chemistry.

Keep the person’s face, expression, and natural features unchanged and realistic, but apply a soft and flattering enhancement: smooth out strong facial lines, reduce signs of tiredness, brighten the eyes, and balance the skin tone for a fresh, youthful, and elegant look. The result should look natural, beautiful, and polished without altering identity

The person should be centered at an apothecary desk surrounded by laboratory objects.
Outfit: an elegant, ceremonial scientific coat filled with colorful molecular structures, chemical bonds, and glowing molecules integrated into the fabric, as if science is woven into the clothing.
Background: seamless blend of science history and modern chemistry — shelves with old apothecary bottles, parchment, books, and scrolls at the bottom; modern lab equipment like microscopes and pipettes on the sides; and glowing futuristic holograms of DNA strands, molecular diagrams, and chemical formulas floating above.
Lighting: warm golden tones mixed with neon accents (blue, orange, cyan), creating a cinematic and luminous atmosphere.
Style: hyper-detailed, cinematic, elegant, and inspiring.
Overall look: the person appears as a mystic, sophisticated apothecary-scientist, with the portrait telling the story of science evolving across time.`;
*/
// Prompt por defecto (fallback)
const DEFAULT_PROMPT = `Transform the uploaded photo of a person into a photorealistic, cinematic portrait of a soccer player. The person's facial identity must be preserved faithfully, while appearing attractive, youthful, and flattering. Emphasize smooth natural skin, wrinkle-free complexion, clear bright eyes, natural symmetry, healthy glow, and subtle photogenic enhancements. Hair color and hairstyle must remain exactly as in the uploaded photo, with no changes.
Outfit: a light gray Colombia 2026 World Cup jersey, sleek and modern, enhanced with Lenovo-inspired futuristic accents: glowing red and silver lines, holographic seams, and digital energy circuits woven into the fabric.
Atmosphere & Aura: a radiant, electrifying aura surrounds the player, infused with glowing data streams and Lenovo-inspired holographic geometry. Subtle sparks, light trails, and digital arcs orbit around, symbolizing performance and innovation.
Background: a futuristic 2026 stadium with cheering fans under dramatic lights. Floating holograms display glowing play diagrams and tactical visuals, merging sport and technology.
Lighting: cinematic golden stadium glow fused with Lenovo neon accents (red, white, cyan), highlighting the player's confident expression and athletic energy.
Style: hyper-detailed, cinematic, elegant, and inspiring — portraying a timeless soccer icon who embodies Colombia's World Cup passion and Lenovo's vision of innovation.`;


// === SISTEMA DE CACHE PARA PROMPTS ===
interface CachedPrompt {
  content: string;
  timestamp: number;
  expiresAt: number;
}

interface PromptDoc {
  basePrompt?: string;
  colorDirectiveTemplate?: string;
  active?: boolean;
}

const CACHE_DURATION_MS = 60 * 1000; // 60 segundos
const promptCache = new Map<string, CachedPrompt>();
const brandedPromptCache = new Map<string, { value: { basePrompt: string; colorDirectiveTemplate?: string; color?: string }; expiresAt: number }>();

// Función para limpiar cache expirado
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, cached] of promptCache.entries()) {
    if (now > cached.expiresAt) {
      promptCache.delete(key);
    }
  }
}

// === Branded prompt loader with cache (60s) ===
async function getBrandedPromptCached(
  brand?: string
): Promise<{ basePrompt: string; colorDirectiveTemplate?: string; color?: string }> {
  const key = `brand:${brand || "default"}`;
  const now = Date.now();
  const cached = brandedPromptCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const col = db.collection("photo_booth_prompts");
    const tryBrands = [brand, "default"].filter(Boolean) as string[];

    for (const b of tryBrands) {
      const snap = await col.where("brand", "==", b).limit(1).get();

      if (!snap.empty) {
        const doc = snap.docs[0];
        const data = doc.data() as PromptDoc | undefined;

        if (data?.active && data.basePrompt?.trim()) {
          const value = {
            basePrompt: data.basePrompt,
            colorDirectiveTemplate: data.colorDirectiveTemplate,
            color: (data as any).color as string | undefined,
          };
          brandedPromptCache.set(key, {
            value,
            expiresAt: now + CACHE_DURATION_MS,
          });
          return value;
        }
      }
    }
  } catch (e) {
    console.warn("getBrandedPromptCached error:", e);
  }

  // fallback si no encuentra nada
  const fallback = {
    basePrompt: DEFAULT_PROMPT,
  } as { basePrompt: string; colorDirectiveTemplate?: string; color?: string };

  brandedPromptCache.set(key, { value: fallback, expiresAt: now + CACHE_DURATION_MS });
  return fallback;
}

// Util: dataURL/base64 → Uint8Array
function decodeBase64(inputB64: string): Uint8Array {
  const commaIdx = inputB64.indexOf(",");
  const pure = commaIdx >= 0 ? inputB64.slice(commaIdx + 1) : inputB64;
  const buf = Buffer.from(pure, "base64");
  return new Uint8Array(buf);
}

// Sanitiza color (evita inyectar cosas raras en el prompt)
function sanitizeColor(color?: string): string | null {
  if (!color) return null;
  const trimmed = color.trim().slice(0, 60);
  // Acepta palabras, números, #hex, comas/espacios (para "teal orange", "rgb(…)")
  if (!/^[#a-z0-9 ,.-]{1,60}$/i.test(trimmed)) return null;
  return trimmed;
}

// Construye el prompt dinámico usando basePrompt + colorDirectiveTemplate (si existe)
async function buildPromptWithBrand(opts: { brand?: string; color?: string }): Promise<string> {
  const { brand, color } = opts || {};
  const branded = await getBrandedPromptCached(brand);
  const basePrompt = branded.basePrompt || DEFAULT_PROMPT;
  const t = branded.colorDirectiveTemplate;
  const c = sanitizeColor(color);
  if (typeof t === "string" && t.trim() && c) {
    const applied = c
      ? t.replace(/\${?color}?/gi, c).replace(/\{color\}/gi, c)
      : t;
    return basePrompt + "\n\n" + applied;
  }
  return basePrompt;
}

export const processGoatShotHttp = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 540, // ~9 minutos
    memory: "1GiB",
    secrets: [OPENAI_API_KEY],
  },
  async (req, res) => {
    try {
      // CORS sencillo (opcional)
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      if (req.method !== "POST") {
        res.status(405).json({ error: "Use POST" });
        return;
      }

      const { inputUrl, inputPath, inputB64, mime, color, brand } = req.body || {};
      const finalPrompt = await buildPromptWithBrand({ brand, color });

      console.log("finalPrompt", finalPrompt);
      if (!inputUrl && !inputPath && !inputB64) {
        res
          .status(400)
          .json({ error: "Falta inputUrl o inputPath o inputB64" });
        return;
      }

      // 1) Obtener bytes y mime de la imagen de entrada
      let bytes: Uint8Array;
      let inMime = "image/png";

      if (inputB64) {
        bytes = decodeBase64(inputB64);
        if (typeof inputB64 === "string" && inputB64.startsWith("data:")) {
          const m = /^data:([^;]+);base64,/i.exec(inputB64);
          if (m?.[1]) inMime = m[1];
        } else if (mime?.startsWith?.("image/")) {
          inMime = mime;
        }
      } else if (inputUrl) {
        // Descargar desde la URL pública de Firebase Storage (con token)
        const resp = await fetch(inputUrl);
        if (!resp.ok) {
          res
            .status(400)
            .json({ error: `No se pudo descargar inputUrl (${resp.status})` });
          return;
        }
        const arrBuf = await resp.arrayBuffer();
        bytes = new Uint8Array(arrBuf);
        const ct = resp.headers.get("content-type") || "";
        inMime = ct.startsWith("image/")
          ? ct
          : mime?.startsWith?.("image/")
            ? mime
            : "image/png";
      } else {
        // inputPath (ruta en tu bucket)
        const bucket = getStorage().bucket();
        const file = bucket.file(String(inputPath));
        const [meta] = await file
          .getMetadata()
          .catch(() => [{ contentType: "application/octet-stream" } as { contentType: string }]);
        const [fileBuf] = await file.download();
        bytes = new Uint8Array(fileBuf);
        const metaCt = typeof meta?.contentType === 'string' ? meta.contentType : undefined;
        inMime = metaCt && metaCt.startsWith("image/") ? metaCt : "image/png";
      }
      // 3) Llamar a OpenAI Images/edits (puede tardar varios minutos)
      type OpenAIImagesResponse = { data?: Array<{ b64_json?: string }> };

      async function callOpenAI(fieldName: "image" | "image[]") {
        const form = new FormData();
        form.set("model", MODEL);
        form.set("prompt", finalPrompt);
        form.set("size", "1024x1024");
        form.set("input_fidelity", "high");
        form.set("output_format", "png");

        const blob = new Blob([Buffer.from(bytes)], {
          type: inMime || "image/png",
        });
        form.append(fieldName, blob, "input.png");

        const resp = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}` },
          body: form,
        });

        const raw = await resp.text();
        let json: OpenAIImagesResponse | null = null;
        try {
          json = JSON.parse(raw) as OpenAIImagesResponse;
        } catch {
          // raw se guarda para diagnóstico
        }
        return { ok: resp.ok, status: resp.status, json, raw };
      }

      let r = await callOpenAI("image");
      if (!r.ok && r.status === 400) {
        // Fallback de compatibilidad
        r = await callOpenAI("image[]");
      }

      if (!r.ok) {
        res
          .status(502)
          .json({ error: `OpenAI ${r.status}`, details: r.json || r.raw });
        return;
      }

      const b64 = r.json?.data?.[0]?.b64_json as string | undefined;
      if (!b64) {
        res.status(502).json({ error: "Respuesta sin imagen" });
        return;
      }

      // 4) Guardar PNG de salida en Storage y devolver URL con token
      const bucket = getStorage().bucket();
      const taskId = randomUUID();
      const outPath = `${OUTPUT_PREFIX}/${taskId}/output.png`;
      const outBuf = Buffer.from(b64, "base64");

      const token = randomUUID();
      await bucket.file(outPath).save(outBuf, {
        contentType: "image/png",
        resumable: false,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });

      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name
        }/o/${encodeURIComponent(outPath)}?alt=media&token=${token}`;

      // 5) Respuesta HTTP (ideal para tu QR)
      res.json({
        status: "done",
        taskId,
        url,
        outputPath: outPath,
        // Info adicional sobre el cache
        promptUsed: finalPrompt,
        promptSource: brand ? 'firestore' : 'default',
        cacheInfo: {
          totalCachedPrompts: promptCache.size,
          usedCachedPrompt: Boolean(brand)
        }
      });
    } catch (e: unknown) {
      console.error('Error en processGoatShotHttp:', e);
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message || "Error interno del servidor" });
    }
  }
);

// Función adicional para obtener estadísticas del cache (opcional)
export const getCacheStats = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    cleanExpiredCache();

    const stats = {
      totalCachedPrompts: promptCache.size,
      prompts: Array.from(promptCache.entries()).map(([id, cached]) => ({
        id,
        timestamp: new Date(cached.timestamp).toISOString(),
        expiresAt: new Date(cached.expiresAt).toISOString(),
        contentLength: cached.content.length
      }))
    };

    res.json(stats);
  }
);