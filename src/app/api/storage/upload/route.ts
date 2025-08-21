import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
// app/api/storage/upload/route.ts
import { NextRequest } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";

function initAdmin() {
  if (!getApps().length) {
    // Usa applicationDefault() o cert({...}) según tu despliegue
    initializeApp({
      credential: applicationDefault(),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // p.ej.: "lenovo-experiences.appspot.com"
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    initAdmin();

    const { dataUrl, desiredPath } = await req.json();

    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return new Response("dataUrl inválido", { status: 400 });
    }

    // Parsear dataURL
    const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!match) return new Response("dataUrl debe ser base64", { status: 400 });

    const contentType = match[1] || "image/png";
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");

    const bucket = getStorage().bucket();
    const path = desiredPath || `survey-submissions/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const file = bucket.file(path);

    const token = uuidv4();

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: token, // para URL tipo getDownloadURL
        },
      },
    });

    // Construye URL estilo getDownloadURL
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      path
    )}?alt=media&token=${token}`;

    return Response.json({ url, path });
  } catch (err: unknown) {
    console.error("Upload error:", err);
    const errorMsg = err instanceof Error ? err.message : "upload failed";
    return new Response(`Error: ${errorMsg}`, { status: 500 });
  }
}
