// functions/src/index.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "crypto";

// Inicializa Admin SDK
initializeApp();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// === Goat Shot: paths ===
const OUTPUT_PREFIX = "goat-shot/outputs";

// Modelo base y prompt
const MODEL = "gpt-image-1";
const BASE_PROMPT = `Transform the uploaded photo of a person into a hyper-realistic, artistic portrait inspired by the history of pharmacy and chemistry.

Keep the person’s face, expression, and natural features unchanged and realistic, but apply a soft and flattering enhancement: smooth out strong facial lines, reduce signs of tiredness, brighten the eyes, and balance the skin tone for a fresh, youthful, and elegant look. The result should look natural, beautiful, and polished without altering identity

The person should be centered at an apothecary desk surrounded by laboratory objects.
Outfit: an elegant, ceremonial scientific coat filled with colorful molecular structures, chemical bonds, and glowing molecules integrated into the fabric, as if science is woven into the clothing.
Background: seamless blend of science history and modern chemistry — shelves with old apothecary bottles, parchment, books, and scrolls at the bottom; modern lab equipment like microscopes and pipettes on the sides; and glowing futuristic holograms of DNA strands, molecular diagrams, and chemical formulas floating above.
Lighting: warm golden tones mixed with neon accents (blue, orange, cyan), creating a cinematic and luminous atmosphere.
Style: hyper-detailed, cinematic, elegant, and inspiring.
Overall look: the person appears as a mystic, sophisticated apothecary-scientist, with the portrait telling the story of science evolving across time.`;

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

// Construye el prompt dinámico con color opcional
function buildPrompt(color?: string) {
  const c = sanitizeColor(color);
  if (!c) return BASE_PROMPT;
  return (
    BASE_PROMPT +
    `

Color direction: emphasize an overall color theme of "${c}" in fabrics, holograms and lighting accents while keeping skin tones natural.`
  );
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

      const { inputUrl, inputPath, inputB64, mime, color } = req.body || {};

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
          .catch(() => [{ contentType: "application/octet-stream" } as any]);
        const [fileBuf] = await file.download();
        bytes = new Uint8Array(fileBuf);
        inMime = (meta?.contentType || "image/png").startsWith("image/")
          ? meta.contentType
          : "image/png";
      }

      // 2) Llamar a OpenAI Images/edits (puede tardar varios minutos)
      async function callOpenAI(fieldName: "image" | "image[]") {
        const form = new FormData();
        form.set("model", MODEL);
        form.set("prompt", buildPrompt(color));
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
          body: form as any,
        });

        const raw = await resp.text();
        let json: any = null;
        try {
          json = JSON.parse(raw);
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

      // 3) Guardar PNG de salida en Storage y devolver URL con token
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

      const url = `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(outPath)}?alt=media&token=${token}`;

      // 4) Respuesta HTTP (ideal para tu QR)
      res.json({
        status: "done",
        taskId,
        url,
        outputPath: outPath,
        // (Opcional) por si quieres mostrar qué prompt se usó finalmente
        promptUsed: buildPrompt(color),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Error" });
    }
  }
);
