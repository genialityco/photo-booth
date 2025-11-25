// functions/src/index.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import sharp from "sharp";
import { GoogleAuth } from "google-auth-library"
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
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

const DEFAULT_LOGO_PROMPT = `Place the uploaded logo on the jersey, centered on the chest area. The logo must be clearly visible, sharp, and seamlessly integrated into the fabric — as if naturally printed or embroidered on the jersey. Preserve the logo’s original colors, proportions, and design without distortion. Adjust lighting, shadows, and reflections so the logo blends realistically with the folds and texture of the jersey material. Ensure the placement looks authentic, like a real sports uniform detail`
// === SISTEMA DE CACHE PARA PROMPTS ===
interface CachedPrompt {
  content: string;
  timestamp: number;
  expiresAt: number;
}

interface PromptDoc {
  basePrompt?: string;
  logoPath?: string 
  logoPrompt?: string;
  colorDirectiveTemplate?: string;
  active?: boolean;
}

const CACHE_DURATION_MS = 60 * 1000; // 60 segundos
const promptCache = new Map<string, CachedPrompt>();
const brandedPromptCache = new Map<string, { value: { basePrompt: string; colorDirectiveTemplate?: string; color?: string; logoPath?: string, logoPrompt?: string}; expiresAt: number }>();
const VERTEX_PROJECT_ID = "lenovo-experiences"; // Usar tu ID de proyecto
const VERTEX_LOCATION = "us-central1"; // Usar la región adecuada
const VERTEX_MODEL_ID = "veo-3.1-fast-generate-preview"; // El modelo Veo en Vertex AI
const TAG1 = "predictLongRunning"
const TAG2 = "fetchPredictOperation"
const VERTEX_API_BASE_URL = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL_ID}:${TAG1}`;
const VERTEX_API_BASE_URL_FETCH = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL_ID}:${TAG2}`;
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
): Promise<{ basePrompt: string; colorDirectiveTemplate?: string; color?: string,  logoPath?: string, logoPrompt?: string}> {
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
            logoPath: data.logoPath,
            logoPrompt: data.logoPrompt
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
async function buildPromptWithBrand(opts: { brand?: string; color?: string }): Promise<{logoPath: string | undefined, prompt: string, logoPrompt?: string}> {
  const { brand, color } = opts || {};
  const branded = await getBrandedPromptCached(brand);
  const basePrompt = branded.basePrompt || DEFAULT_PROMPT;
  const t = branded.colorDirectiveTemplate;
  const c = sanitizeColor(color);
  if (typeof t === "string" && t.trim() && c) {
    const applied = c
      ? t.replace(/\${?color}?/gi, c).replace(/\{color\}/gi, c)
      : t;
    return {logoPrompt: branded.logoPrompt, logoPath: branded.logoPath, prompt:basePrompt + "\n\n" + applied};
  }
  return {logoPrompt: branded.logoPrompt, logoPath: branded.logoPath, prompt:basePrompt};
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
        form.set("prompt", finalPrompt.prompt);
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



// Define tu secret para Gemini API Key
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");


async function downloadAndConvertLogo(
  logoUrl: string
): Promise<{ base64: string; mime: string } | null> {
  try {
    console.log("Downloading logo from URL:", logoUrl);
    
    // Descargar el archivo
    const response = await axios.get(logoUrl, { 
        responseType: "arraybuffer", // Importante para manejar archivos binarios
        maxContentLength: 10 * 1024 * 1024, // Limitar tamaño de descarga a 10MB
    });

    const logoFileBuf = Buffer.from(response.data as ArrayBuffer);
    const contentType = response.headers["content-type"] || "";
    const isSvg = contentType.includes("image/svg") || logoUrl.toLowerCase().endsWith(".svg");

    let base64Logo: string;
    let logoMime: string;

    if (isSvg) {
      // SVG no es soportado por Gemini, convertir a PNG
      console.log("SVG detected, converting to PNG...");

      // Convertir SVG a PNG
      const pngBuffer = await sharp(logoFileBuf)
        .resize(512, 512, { // Tamaño razonable para logo
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();

      base64Logo = pngBuffer.toString("base64");
      logoMime = "image/png";
      console.log("SVG converted to PNG, size:", pngBuffer.length);
    } else {
      // PNG o JPG - usar directamente
      base64Logo = logoFileBuf.toString("base64");

      if (contentType.startsWith("image/")) {
        logoMime = contentType; // image/png, image/jpeg
      } else if (logoUrl.toLowerCase().endsWith(".jpg") || logoUrl.toLowerCase().endsWith(".jpeg")) {
        logoMime = "image/jpeg";
      } else {
        logoMime = "image/png"; // Default fallback
      }

      console.log("Logo loaded:", logoUrl, "MIME:", logoMime, "size:", logoFileBuf.length);
    }

    return { base64: base64Logo, mime: logoMime };
  } catch (logoError: any) {
    console.error("Error loading or converting logo from URL:", logoUrl, logoError.message);
    return null; // Continuar sin logo si hay error
  }
}

// --- Función Principal Modificada ---

export const processImageTask = onDocumentCreated(
  {
    document: "imageTasks/{taskId}",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: [GEMINI_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const taskId = event.params.taskId as string;
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const docRef = db.collection("imageTasks").doc(taskId);
    const data = snap.data() as
      | {
          inputPath?: string;
          brand?: string;
          color?: string;
        }
      | undefined;

    let PROMPT = DEFAULT_PROMPT;
    let LOGO_PROMPT = DEFAULT_LOGO_PROMPT;
    let LOGO_URL = ""; // Cambiado el nombre de la variable para reflejar su contenido (URL)
    if (data?.brand) {
      const promptData = await buildPromptWithBrand({
        brand: data.brand,
        color: data.color,
      });
      PROMPT = promptData.prompt;
      LOGO_URL = promptData.logoPath || ""; // Asumimos que buildPromptWithBrand devuelve la URL en logoPath
      LOGO_PROMPT = promptData.logoPrompt || DEFAULT_LOGO_PROMPT;
    
    }

    if (!data?.inputPath) {
      await docRef.update({
        status: "error",
        error: "Falta inputPath",
        updatedAt: Date.now(),
      });
      return;
    }

    try {
      await docRef.update({ status: "processing", updatedAt: Date.now() });

      // 1) Descargar input desde Storage (esto sigue igual)
      const file = bucket.file(data.inputPath);
      const [meta] = await file
        .getMetadata()
        .catch(() => [{ contentType: "application/octet-stream" } as any]);
      const [fileBuf] = await file.download();

      const bytes = new Uint8Array(fileBuf);
      const byteLen = bytes.byteLength;
      const mime = (meta?.contentType || "image/png").startsWith("image/")
        ? meta.contentType
        : "image/png";

      const base64Image = Buffer.from(bytes).toString("base64");

      // 2) Descargar logo desde URL si existe
      let base64Logo: string | null = null;
      let logoMime = "image/png";
      
      if (LOGO_URL) {
        const logoData = await downloadAndConvertLogo(LOGO_URL);
        if (logoData) {
            base64Logo = logoData.base64;
            logoMime = logoData.mime;
        }
      }
      
      // Actualizar debug info
      await docRef.update({
        debug: {
          inputPath: data.inputPath,
          mime,
          byteLen,
          prompt: PROMPT,
          hasLogo: !!base64Logo,
          logoUrl: LOGO_URL || null, // Cambiado a logoUrl
        },
      });

      console.log("Calling Gemini API...");

      // 3) Llamar a Gemini API
      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY.value(),
      });

      // Construir parts dinámicamente
      const parts = [
        { text: PROMPT },
        {
          inlineData: {
            mimeType: mime,
            data: base64Image,
          },
        },
      ];

      // Agregar logo si existe
      if (base64Logo) {
        parts.unshift(
          { text:  LOGO_PROMPT},
          {
            inlineData: {
              mimeType: logoMime,
              data: base64Logo,
            },
          }
        );
      }
      
      // ... (El resto del código para llamar a Gemini y guardar la salida sigue igual)
      // ... (Resto del código para la llamada a Gemini, verificación de errores y guardado de salida)
      const contents = [
        {
          role: "user",
          parts: parts,
        },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: contents,
   
      });

      console.log("Response received:", JSON.stringify(response, null, 2));

      // 3) Verificar si hay error de quota
      if (response.promptFeedback?.blockReason) {
        await docRef.update({
          status: "error",
          error: `Blocked: ${response.promptFeedback.blockReason}`,
          updatedAt: Date.now(),
          details: response.promptFeedback,
        });
        return;
      }

      // 4) Extraer la imagen generada
      const firstCandidate = response.candidates?.[0];
      
      if (!firstCandidate) {
        console.error("No candidates in response:", response);
        await docRef.update({
          status: "error",
          error: "Sin candidatos en respuesta",
          updatedAt: Date.now(),
          details: { response },
        });
        return;
      }

      // Buscar la imagen en las partes
      const imagePart = firstCandidate.content?.parts?.find(
        (part) => part.inlineData && part.inlineData.mimeType?.startsWith("image/")
      );
      
      const generatedImageData = imagePart?.inlineData?.data;
      
      if (!generatedImageData) {
        // Intentar obtener texto de error si existe
        const textParts = firstCandidate.content?.parts
          ?.filter(p => p.text)
          .map(p => p.text)
          .join(" ") || "Sin respuesta de texto";
        
        console.error("No image found in response. Text:", textParts);
        console.error("Full candidate:", JSON.stringify(firstCandidate, null, 2));
        
        await docRef.update({
          status: "error",
          error: "Respuesta sin imagen generada",
          updatedAt: Date.now(),
          details: { 
            textResponse: textParts.substring(0, 500),
            finishReason: firstCandidate.finishReason,
            safetyRatings: firstCandidate.safetyRatings,
          },
        });
        return;
      }
     
      console.log("Image found, saving to storage...");

      // 5) Guardar salida y generar URL con token
      const outPath = `tasks/${taskId}/output.png`;
      const outBuf = Buffer.from(generatedImageData, "base64");

      const token = randomUUID();
      await bucket.file(outPath).save(outBuf, {
        contentType: "image/png",
        resumable: false,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      const url = `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(outPath)}?alt=media&token=${token}`;

      console.log("Image saved successfully:", url);

      // 6) Done
      await docRef.update({
        status: "done",
        url,
        outputPath: outPath,
        updatedAt: Date.now(),
      });
    } catch (e: any) {
      console.error("processImageTask error:", e);
      
      // Detectar error de quota específicamente
      const isQuotaError = e?.message?.includes("quota") || 
                          e?.message?.includes("429") ||
                          e?.status === 429;
      
      await docRef.update({
        status: "error",
        error: isQuotaError 
          ? "Error de quota: Necesitas habilitar billing en Google AI Studio"
          : e?.message ?? "Error desconocido",
        errorType: isQuotaError ? "quota_exceeded" : "unknown",
        prompt: PROMPT,
        updatedAt: Date.now(),
        stackTrace: e?.stack?.substring(0, 500),
      });
    }
  }
);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Función para agregar marco al video
async function addFrameToVideo(
  videoBuffer: Buffer,
  frameConfig: {
    color?: string;
    thickness?: number;
    frameImageBuffer?: Buffer;
  } = {}
): Promise<Buffer> {
  const { thickness = 0, frameImageBuffer } = frameConfig;
  
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input-${Date.now()}.mp4`);
  const outputPath = path.join(tempDir, `output-${Date.now()}.mp4`);
  let framePath: string | null = null;
  
  try {
    fs.writeFileSync(inputPath, videoBuffer);
    
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(inputPath);
      
      if (frameImageBuffer) {
        // Guardar el buffer del marco como archivo temporal
        framePath = path.join(tempDir, `frame-${Date.now()}.png`);
        fs.writeFileSync(framePath, frameImageBuffer);

        command
          .input(framePath)
          .complexFilter([
            // Reducir el tamaño del video para que entre dentro del marco
            `[0:v]scale=iw-${thickness -30}:ih-${thickness-30}[scaled]`,
            // IMPORTANTE: el marco arriba (1:v) y el video dentro (scaled)
            `[scaled][1:v]overlay=${thickness-30}:${thickness-30}:format=auto`
          ]);
      } else {
        command.videoFilters([
          {
            filter: 'pad',
            options: {
              width: `iw+${thickness * 2}`,
              height: `ih+${thickness * 2}`,
              x: thickness,
              y: thickness,
              
            }
          }
        ]);
      }
      
      command
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-c:a copy'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
    
    const outputBuffer = fs.readFileSync(outputPath);
    return outputBuffer;
    
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (framePath && fs.existsSync(framePath)) fs.unlinkSync(framePath);
    } catch (e) {
      console.warn('Error limpiando archivos temporales:', e);
    }
  }
}



export const processVideoTask = onDocumentCreated(
  {
    document: "videoTasks/{taskId}",
    region: VERTEX_LOCATION,
    timeoutSeconds: 540,
    memory: "2GiB",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const taskId = event.params.taskId;
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const docRef = db.collection("videoTasks").doc(taskId);
    const data = snap.data();

    // Prompts y logos
    let PROMPT = DEFAULT_PROMPT;
    let LOGO_URL = "";

    if (data?.brand) {
      const promptData = await buildPromptWithBrand({
        brand: data.brand,
        color: data.color,
      });

      PROMPT = promptData.prompt;
      LOGO_URL = promptData.logoPath || "";
    }

    if (!data?.inputPath) {
      await docRef.update({
        status: "error",
        error: "Falta inputPath",
        updatedAt: Date.now(),
      });
      return;
    }

    try {
      await docRef.update({
        status: "processing",
        updatedAt: Date.now(),
      });

      // Descargar la imagen input
      const file = bucket.file(data.inputPath);
      const [meta] = await file.getMetadata().catch(() => [
        { contentType: "application/octet-stream" },
      ]);
      const [fileBuf] = await file.download();

      const bytes = new Uint8Array(fileBuf);
      const byteLen = bytes.byteLength;
      const mime = (meta?.contentType || "image/png").startsWith("image/")
        ? meta!.contentType
        : "image/png";

      const base64Image = Buffer.from(bytes).toString("base64");

      // Descargar logo si existe
      let base64Logo: string | null = null;

      if (LOGO_URL) {
        const logoData = await downloadAndConvertLogo(LOGO_URL);
        if (logoData) {
          base64Logo = logoData.base64;
        }
      }

      await docRef.update({
        debug: {
          inputPath: data.inputPath,
          mime,
          byteLen,
          prompt: PROMPT,
          hasLogo: !!base64Logo,
          logoUrl: LOGO_URL || null,
        },
      });

      // Llamar a Vertex AI VEO 3.1 con REST y axios
      const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      const authToken = await auth.getAccessToken();

      const VERTEX_OUTPUT_GCS_BUCKET = `gs://${bucket.name}`;
      const outputGcsPath = `veo-output/${taskId}/`;
      const outputGcsUri = `${VERTEX_OUTPUT_GCS_BUCKET}/${outputGcsPath}`;

      const instances: any[] = [
        {
          prompt: PROMPT,
          image: {
            bytesBase64Encoded: base64Image,
            mimeType: mime,
          },
        },
      ];

      const payload = {
        instances: instances,
        parameters: {
          aspectRatio: "9:16",
          sampleCount: 1,
          durationSeconds: 8,
          storageUri: outputGcsUri,
          negativePrompt: "imagen original en el video final",
        },
      };

      console.log("authToken", authToken);
      console.log("Payload enviado a Vertex AI:", JSON.stringify(payload, null, 2));

      // Llamar al endpoint Long Running Operation (LRO)
      const veoResponse = await axios.post(VERTEX_API_BASE_URL, payload, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      });

      const operationName = veoResponse.data.name;
      await docRef.update({
        vertexName: operationName,
        updatedAt: Date.now(),
      });

      // Sondear el estado de la LRO hasta que se complete
      let isDone = false;
      let finalResult: any = null;
      let attempt = 0;
      const MAX_ATTEMPTS = 50;

      while (!isDone && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Esperar 10 segundos
        attempt++;

        const fetchPayload = {
          operationName: operationName,
        };

        const lroResponse = await axios.post(VERTEX_API_BASE_URL_FETCH, fetchPayload, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const lroData = lroResponse.data;
        isDone = !!lroData.done;

        if (isDone) {
          if (lroData.error) {
            throw new Error(`Vertex AI LRO failed: ${lroData.error.message}`);
          }
          finalResult = lroData.response;
        }
      }

      if (!isDone) {
        throw new Error("Vertex AI LRO Timeout: La operación no se completó a tiempo.");
      }

      console.log("Resultado final de LRO:", JSON.stringify(finalResult, null, 2));

      // Obtener y Descargar el video desde GCS/Firebase Storage
      const generatedFilePath = finalResult?.videos?.[0]?.gcsUri;

      if (!generatedFilePath) {
        throw new Error("Respuesta de LRO sin ruta GCS del video generado.");
      }

      const gcsFilePath = generatedFilePath.replace(VERTEX_OUTPUT_GCS_BUCKET + "/", "");
      console.log("Descargando video desde:", gcsFilePath);

      // Descargar el video generado
      const [fileContents] = await bucket.file(gcsFilePath).download();
      console.log("Video descargado, tamaño:", fileContents.length);

      // DESCARGAR LA IMAGEN DEL MARCO DESDE FIREBASE STORAGE
      let frameBuffer: Buffer | undefined;
      try {
        const frameFile = bucket.file('frames/MARCO_UM_RECUERDO.png');
        const [frameExists] = await frameFile.exists();
        
        if (frameExists) {
          const [downloadedFrame] = await frameFile.download();
          frameBuffer = downloadedFrame;
          console.log('Marco descargado correctamente, tamaño:', frameBuffer.length);
        } else {
          console.warn('Imagen de marco no encontrada en: frames/MARCO_UM_RECUERDO.png');
        }
      } catch (frameError) {
        console.error('Error descargando marco:', frameError);
      }

      // AGREGAR MARCO AL VIDEO CON MANEJO DE ERRORES
      let videoWithFrame: Buffer;
      try {
        console.log('Iniciando proceso de agregar marco...');
        videoWithFrame = await addFrameToVideo(fileContents, {
          color: 'white',
          thickness: 30,
          frameImageBuffer: frameBuffer
        });
        console.log('Marco agregado exitosamente, tamaño final:', videoWithFrame.length);
      } catch (frameError) {
        console.error('Error agregando marco, usando video original:', frameError);
        videoWithFrame = fileContents; // Usar video original si falla
      }

      // Convertir a base64
      const generatedVideoData = videoWithFrame.toString("base64");

      // Opcional: eliminar archivo temporal de Vertex AI
      try {
        await bucket.file(gcsFilePath).delete();
        console.log('Archivo temporal eliminado de GCS');
      } catch (deleteError) {
        console.warn('No se pudo eliminar archivo temporal:', deleteError);
      }

      if (!generatedVideoData) {
        await docRef.update({
          status: "error",
          error: "No se pudo procesar el video generado",
          updatedAt: Date.now(),
        });
        return;
      }

      // Guardar video en Firebase Storage
      const outPath = `video/task/${taskId}/output.mp4`;
      const outBuf = Buffer.from(generatedVideoData, "base64");
      const token = randomUUID();

      console.log('Guardando video final en Firebase Storage...');
      await bucket.file(outPath).save(outBuf, {
        contentType: "video/mp4",
        resumable: false,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      console.log('Video guardado exitosamente en:', outPath);

      // Actualizar Documento
      const url = `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(outPath)}?alt=media&token=${token}`;

      await docRef.update({
        status: "done",
        url,
        outputPath: outPath,
        updatedAt: Date.now(),
      });

      console.log('Proceso completado exitosamente');

    } catch (e: any) {
      console.error('Error en processVideoTask:', e);
      
      const isQuotaError =
        e?.message?.includes("quota") ||
        e?.message?.includes("429") ||
        e?.response?.status === 429;

      await docRef.update({
        status: "error",
        error: isQuotaError
          ? "Error de quota: habilita billing en Google AI Studio o Vertex AI"
          : e?.message || "Error desconocido",
        errorType: isQuotaError ? "quota_exceeded" : "unknown",
        prompt: PROMPT,
        updatedAt: Date.now(),
        stackTrace: e?.stack?.substring(0, 500),
      });
    }
  }
);