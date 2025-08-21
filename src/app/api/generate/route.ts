/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // 👈 fuerza Node en Netlify (más límite de body)

function dataUrlToUint8Array(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = Buffer.from(base64, "base64"); // en Node tenemos Buffer
  return new Uint8Array(binary);
}

export async function POST(req: Request) {
  try {
    // ✅ leer como form-data (no JSON)
    const form = await req.formData();

    // Opción A: te mandan un archivo binario (mejor)
    const file = form.get("photo") as File | null;

    // Opción B: te mandan un dataURL en un campo de texto (aceptable si no pasa límites)
    const dataUrl = form.get("photoDataUrl") as string | null;

    if (!file && !dataUrl) {
      return NextResponse.json(
        { error: "Falta 'photo' o 'photoDataUrl'" },
        { status: 400 }
      );
    }

    let inputBlob: Blob;
    if (file) {
      inputBlob = file; // viene con type y size correctos
    } else {
      // dataURL -> Blob
      const bytes = dataUrlToUint8Array(dataUrl!);
      inputBlob = new Blob([bytes], { type: "image/png" });
    }

    const prompt = `Transform the uploaded photo of a person into a hyper-realistic, artistic portrait inspired by the history of pharmacy and chemistry. Keep the person’s face, expression, and natural features unchanged and realistic, but apply a subtle beauty enhancement (smooth skin, balanced lighting on the face, refined details) so the portrait looks polished and elegant without altering identity.
The person should be centered at an apothecary desk surrounded by laboratory objects.
Outfit: an elegant, ceremonial scientific coat filled with colorful molecular structures, chemical bonds, and glowing molecules integrated into the fabric, as if science is woven into the clothing.
Background: seamless blend of science history and modern chemistry — shelves with old apothecary bottles, parchment, books, and scrolls at the bottom; modern lab equipment like microscopes and pipettes on the sides; and glowing futuristic holograms of DNA strands, molecular diagrams, and chemical formulas floating above.
Lighting: warm golden tones mixed with neon accents (blue, orange, cyan), creating a cinematic and luminous atmosphere.
Style: hyper-detailed, cinematic, elegant, and inspiring.
Overall look: the person appears as a mystic, sophisticated apothecary-scientist, with the portrait telling the story of science evolving across time.`;

    const body = new FormData();
    body.set("model", "gpt-image-1");
    body.set("prompt", prompt);
    body.set("size", "1024x1024");
    body.set("quality", "high");
    body.set("input_fidelity", "high");
    body.set("output_format", "png");
    body.append("image", inputBlob, "photo.png");

    const resp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      },
      body,
    });

    // si la API no responde JSON, resp.json() fallaría, por eso leemos texto y luego intentamos parsear
    const raw = await resp.text();
    if (!resp.ok) {
      console.error("OpenAI error:", resp.status, raw);
      return NextResponse.json(
        { error: `OpenAI ${resp.status}: ${raw}` },
        { status: 502 }
      );
    }

    let json: any;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      console.error("OpenAI no devolvió JSON:", raw.slice(0, 200));
      return NextResponse.json(
        { error: "Respuesta de OpenAI no-JSON" },
        { status: 502 }
      );
    }

    const b64 = json?.data?.[0]?.b64_json as string | undefined;
    if (!b64) {
      return NextResponse.json(
        { error: "Respuesta sin imagen" },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: `data:image/png;base64,${b64}` });
  } catch (err: any) {
    console.error("Error generando imagen:", err);
    return NextResponse.json(
      { error: err?.message ?? "Error interno" },
      { status: 500 }
    );
  }
}
