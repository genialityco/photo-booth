import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { randomUUID } from "crypto";

// Inicializa Admin SDK (Functions v2, Node 18/22)
initializeApp();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const MODEL = "gpt-image-1";
const PROMPT = `Transform the uploaded photo of a person into a hyper-realistic, artistic portrait inspired by the history of pharmacy and chemistry. Keep the person’s face, expression, and natural features unchanged and realistic, but apply a subtle, natural retouch (balanced lighting, gentle skin smoothing, refined details) so the portrait looks polished and elegant without altering identity.
The person should be centered at an apothecary desk surrounded by laboratory objects.
Outfit: an elegant, ceremonial scientific coat filled with colorful molecular structures, chemical bonds, and glowing molecules integrated into the fabric, as if science is woven into the clothing.
Background: seamless blend of science history and modern chemistry — shelves with old apothecary bottles, parchment, books, and scrolls at the bottom; modern lab equipment like microscopes and pipettes on the sides; and glowing futuristic holograms of DNA strands, molecular diagrams, and chemical formulas floating above.
Lighting: warm golden tones mixed with neon accents (blue, orange, cyan), creating a cinematic and luminous atmosphere.
Style: hyper-detailed, cinematic, elegant, and inspiring.
Overall look: the person appears as a mystic, sophisticated apothecary-scientist, with the portrait telling the story of science evolving across time.`;

// Trigger: cuando se crea un doc en imageTasks/{taskId}
export const processImageTask = onDocumentCreated(
  {
    document: "imageTasks/{taskId}",
    region: "us-central1",
    timeoutSeconds: 540, // hasta 9 min
    memory: "1GiB",
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const taskId = event.params.taskId as string;
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const docRef = db.collection("imageTasks").doc(taskId);
    const data = snap.data() as { inputPath?: string } | undefined;

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

      // 1) Descargar input desde Storage
      const file = bucket.file(data.inputPath);
      const [meta] = await file
        .getMetadata()
        .catch(() => [{ contentType: "application/octet-stream" } as any]);
      const [fileBuf] = await file.download(); // Buffer

      const bytes = new Uint8Array(fileBuf); // normaliza a BufferSource
      const byteLen = bytes.byteLength;
      const mime = (meta?.contentType || "image/png").startsWith("image/")
        ? meta.contentType
        : "image/png";

      // Guarda diagnóstico mínimo en el doc (útil si se corta el log)
      await docRef.update({
        debug: {
          inputPath: data.inputPath,
          mime,
          byteLen,
        },
      });

      // Helper: intenta parsear JSON de respuesta; si no, devuelve raw truncado
      const parseMaybeJson = (raw: string) => {
        try {
          return { json: JSON.parse(raw), raw: null };
        } catch {
          return { json: null, raw: raw.slice(0, 1200) };
        }
      };

      // Helper: llamada a OpenAI con una clave de campo concreta
      async function callOpenAI(fieldName: "image" | "image[]") {
        const form = new FormData();
        form.set("model", MODEL);
        form.set("prompt", PROMPT);
        // tamaños válidos: 1024x1024, 1024x1536, 1536x1024, auto
        form.set("size", "1024x1024");
        // form.set("quality", "high"); // low | medium | high | auto
        // form.set("input_fidelity", "high"); // mejor preservación de rostro
        // form.set("output_format", "png"); // png | jpeg | webp

        const blob = new Blob([bytes], { type: mime || "image/png" });
        form.append(fieldName, blob, "input.png");

        const resp = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}` },
          body: form as any,
        });

        const requestId = resp.headers.get("x-request-id") || null;
        const respType = resp.headers.get("content-type") || "";
        const raw = await resp.text();
        const { json, raw: rawSnippet } = parseMaybeJson(raw);
        return {
          ok: resp.ok,
          status: resp.status,
          json,
          rawSnippet,
          respType,
          requestId,
        };
      }

      // 2) INTENTO 1: usar "image"
      let r = await callOpenAI("image");

      // Si 400, INTENTO 2: usar "image[]"
      if (!r.ok && r.status === 400) {
        await docRef.update({
          debug: {
            ...((await docRef.get()).data() as any)?.debug,
            firstAttempt: {
              status: r.status,
              respType: r.respType,
              requestId: r.requestId,
              details: r.json || r.rawSnippet,
            },
          },
        });
        r = await callOpenAI("image[]");
      }

      if (!r.ok) {
        console.error("OpenAI error:", r.status, r.json || r.rawSnippet);
        await docRef.update({
          status: "error",
          error: `OpenAI ${r.status}`,
          updatedAt: Date.now(),
          details: r.json || r.rawSnippet || null,
          requestId: r.requestId || null,
          respType: r.respType || null,
        });
        return;
      }

      const b64 = r.json?.data?.[0]?.b64_json as string | undefined;
      if (!b64) {
        await docRef.update({
          status: "error",
          error: "Respuesta sin imagen",
          updatedAt: Date.now(),
          details: r.json || r.rawSnippet || null,
        });
        return;
      }

      // 3) Guardar salida y generar URL con token (SIN getSignedUrl)
      const outPath = `tasks/${taskId}/output.png`;
      const outBuf = Buffer.from(b64, "base64");

      const token = randomUUID();
      await bucket.file(outPath).save(outBuf, {
        contentType: "image/png",
        resumable: false,
        metadata: {
          metadata: {
            // 👇 token de descarga estilo Firebase
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      // URL pública con token (no requiere roles extra ni signBlob)
      const url = `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(outPath)}?alt=media&token=${token}`;

      // 4) Done
      await docRef.update({
        status: "done",
        url,
        outputPath: outPath,
        updatedAt: Date.now(),
      });
    } catch (e: any) {
      console.error("processImageTask error:", e);
      await docRef.update({
        status: "error",
        error: e?.message ?? "Error",
        updatedAt: Date.now(),
      });
    }
  }
);
