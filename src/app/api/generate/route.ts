/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

/**
 * Util: convierte dataURL/base64 -> Uint8Array
 */
function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function POST(req: Request) {
  try {
    const { photo } = await req.json(); // dataURL (ej: "data:image/png;base64,....")
    if (!photo || typeof photo !== "string") {
      return NextResponse.json({ error: "Foto inválida" }, { status: 400 });
    }

    const prompt = `Transform the uploaded photo of a person into a hyper-realistic, artistic portrait inspired by the history of pharmacy and chemistry. Keep the person’s face, expression, and natural features unchanged and realistic, but apply a subtle beauty enhancement (smooth skin, balanced lighting on the face, refined details) so the portrait looks polished and elegant without altering identity.
The person should be centered at an apothecary desk surrounded by laboratory objects.
Outfit: an elegant, ceremonial scientific coat filled with colorful molecular structures, chemical bonds, and glowing molecules integrated into the fabric, as if science is woven into the clothing.
Background: seamless blend of science history and modern chemistry — shelves with old apothecary bottles, parchment, books, and scrolls at the bottom; modern lab equipment like microscopes and pipettes on the sides; and glowing futuristic holograms of DNA strands, molecular diagrams, and chemical formulas floating above.
Lighting: warm golden tones mixed with neon accents (blue, orange, cyan), creating a cinematic and luminous atmosphere.
Style: hyper-detailed, cinematic, elegant, and inspiring.
Overall look: the person appears as a mystic, sophisticated apothecary-scientist, with the portrait telling the story of science evolving across time.`;

    // --- Construimos multipart/form-data para /v1/images/edits ---
    const body = new FormData();
    body.set("model", "gpt-image-1");
    body.set("prompt", prompt);
    body.set("size", "1024x1024");      // válidos: 1024x1024, 1536x1024, 1024x1536
    body.set("quality", "high");        // gpt-image-1: low | medium | high | auto
    body.set("input_fidelity", "high"); // mantiene mejor el rostro
    body.set("output_format", "png");   // png | jpeg | webp

    // Adjuntamos la imagen de entrada como archivo
    const bytes = dataUrlToUint8Array(photo);
    const blob = new Blob([bytes], { type: "image/png" });
    body.append("image", blob, "photo.png");

    const resp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
        // ¡NO pongas Content-Type manualmente! fetch lo fija con el boundary del FormData
      },
      body,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("OpenAI error:", resp.status, errText);
      return NextResponse.json(
        { error: `OpenAI: ${resp.status} ${errText}` },
        { status: 502 }
      );
    }

    const json: any = await resp.json();
    // gpt-image-1 retorna base64 en data[].b64_json
    const b64 = json?.data?.[0]?.b64_json as string | undefined;
    if (!b64) {
      return NextResponse.json(
        { error: "Respuesta sin imagen" },
        { status: 502 }
      );
    }

    const url = `data:image/png;base64,${b64}`;
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error("Error generando imagen:", err);
    return NextResponse.json({ error: err.message ?? "Error interno" }, { status: 500 });
  }
}