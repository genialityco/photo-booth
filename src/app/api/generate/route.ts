/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // Fuerza Node en Netlify (acepta bodies grandes)

const MODEL = "gpt-image-1";
/*const PROMPT = `Transform the uploaded photo of a person into a hyper-realistic, artistic portrait inspired by the history of pharmacy and chemistry. Keep the person’s face, expression, and natural features unchanged and realistic, but apply a subtle beauty enhancement (smooth skin, balanced lighting on the face, refined details) so the portrait looks polished and elegant without altering identity.
The person should be centered at an apothecary desk surrounded by laboratory objects.
Outfit: an elegant, ceremonial scientific coat filled with colorful molecular structures, chemical bonds, and glowing molecules integrated into the fabric, as if science is woven into the clothing.
Background: seamless blend of science history and modern chemistry — shelves with old apothecary bottles, parchment, books, and scrolls at the bottom; modern lab equipment like microscopes and pipettes on the sides; and glowing futuristic holograms of DNA strands, molecular diagrams, and chemical formulas floating above.
Lighting: warm golden tones mixed with neon accents (blue, orange, cyan), creating a cinematic and luminous atmosphere.
Style: hyper-detailed, cinematic, elegant, and inspiring.
Overall look: the person appears as a mystic, sophisticated apothecary-scientist, with the portrait telling the story of science evolving across time.`;
*/
const PROMPT = `Transform the uploaded photo of a person into a photorealistic, cinematic portrait of a soccer player. The person’s face should remain faithful to their real identity, with flattering detail: smooth natural skin, clear eyes, and a healthy glow, avoiding any distortion or harsh aging. They are centered on a stadium pitch, styled as a champion.
Outfit: light gray Colombia 2026 World Cup jersey with Lenovo-inspired futuristic accents — glowing red and silver lines, holographic seams, and digital energy circuits woven into the fabric.
Atmosphere & Aura: a radiant tech-inspired aura surrounds them, with glowing data streams and holographic Lenovo geometry.
Lighting: golden stadium glow mixed with neon Lenovo colors (red, white, cyan), highlighting the player’s strength and confidence.
Style: cinematic, elegant, inspiring — a timeless soccer icon merging passion with Lenovo innovation`;


/** Convierte dataURL/base64 -> Uint8Array (para construir un Blob) */
function dataUrlToUint8Array(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const buf = Buffer.from(base64, "base64"); // en Node tenemos Buffer
  return new Uint8Array(buf);
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Falta OPENAI_API_KEY" }, { status: 500 });
    }

    // 1) Leer como multipart/form-data
    const form = await req.formData();

    // Opción A: archivo binario
    const file = form.get("photo") as File | null;

    // Opción B: dataURL como texto
    const dataUrl = form.get("photoDataUrl") as string | null;

    if (!file && !dataUrl) {
      return NextResponse.json(
        { error: "Falta 'photo' (archivo) o 'photoDataUrl' (dataURL)" },
        { status: 400 }
      );
    }

    // 2) Normalizar a Blob
    let inputBlob: Blob;
    if (file) {
      inputBlob = file;
    } else {
      const bytes = dataUrlToUint8Array(dataUrl!);
      inputBlob = new Blob([bytes], { type: "image/png" });
    }

    // 3) Construir el multipart hacia OpenAI
    const body = new FormData();
    body.set("model", MODEL);
    body.set("prompt", PROMPT);
    body.set("size", "1024x1024");       // 1024x1024 | 1536x1024 | 1024x1536 (según soporte)
    body.set("quality", "high");         // low | medium | high | auto
    body.set("input_fidelity", "high");  // mejor preservación de rostro
    body.set("output_format", "png");    // png | jpeg | webp
    body.append("image", inputBlob, "photo.png");

    // 4) Llamada a OpenAI (leer SIEMPRE como texto para depurar mejor)
    const resp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body,
    });

    const raw = await resp.text();

    if (!resp.ok) {
      // Log en server para ver el detalle (lo corta a 500 chars para no saturar logs)
      console.error("OpenAI error:", resp.status, raw?.slice(0, 500));
      return NextResponse.json(
        { error: `OpenAI ${resp.status}`, details: raw || null },
        { status: 502 }
      );
    }

    // 5) Parsear JSON de OpenAI
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      console.error("OpenAI devolvió no-JSON:", raw?.slice(0, 200));
      return NextResponse.json(
        { error: "Respuesta de OpenAI no-JSON" },
        { status: 502 }
      );
    }

    const b64 = json?.data?.[0]?.b64_json as string | undefined;
    if (!b64) {
      return NextResponse.json({ error: "Respuesta sin imagen" }, { status: 502 });
    }

    // 6) Respuesta al cliente
    return NextResponse.json({ url: `data:image/png;base64,${b64}` });
  } catch (err: any) {
    console.error("Error generando imagen:", err);
    return NextResponse.json(
      { error: err?.message ?? "Error interno" },
      { status: 500 }
    );
  }
}
