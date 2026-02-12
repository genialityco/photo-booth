import { getApps, initializeApp, cert } from "firebase-admin/app";
// app/api/storage/upload/route.ts
import { NextRequest } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";

function getStorageBucket() {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
         `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "lenovo-experiences"}.appspot.com`;
}

function initAdmin() {
  if (!getApps().length) {
    const storageBucket = getStorageBucket();
    
    console.log("Initializing Firebase Admin with bucket:", storageBucket);
    
    // Parsear credenciales del entorno
    let serviceAccount: Record<string, unknown>;
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } else {
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing");
      }
    } catch (err) {
      console.error("Error parsing service account:", err);
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT configuration");
    }
    
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    initAdmin();

    const { dataUrl, desiredPath } = await req.json();

    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return Response.json({ error: "dataUrl inválido" }, { status: 400 });
    }

    // Parsear dataURL
    const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!match) return Response.json({ error: "dataUrl debe ser base64" }, { status: 400 });

    const contentType = match[1] || "image/png";
    const base64Data = match[2];
    
    // Verificar que el buffer no esté vacío
    if (!base64Data || base64Data.length === 0) {
      return Response.json({ error: "Empty image data" }, { status: 400 });
    }
    
    const buffer = Buffer.from(base64Data, "base64");
    
    if (buffer.length === 0) {
      return Response.json({ error: "Buffer is empty" }, { status: 400 });
    }

    const storageBucket = getStorageBucket();
    const bucket = getStorage().bucket(storageBucket);
    const path = desiredPath || `survey-submissions/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const file = bucket.file(path);

    const token = uuidv4();

    // Usar createWriteStream para mejor manejo de errores
    await new Promise<void>((resolve, reject) => {
      const writeStream = file.createWriteStream({
        metadata: {
          contentType,
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
        resumable: false,
      });

      writeStream.on("error", (error) => {
        console.error("WriteStream error:", error);
        reject(error);
      });

      writeStream.on("finish", () => {
        console.log("Upload finished successfully");
        resolve();
      });

      writeStream.end(buffer);
    });

    // Construye URL estilo getDownloadURL
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      path
    )}?alt=media&token=${token}`;

    console.log("Upload successful:", { path, url });
    return Response.json({ url, path });
  } catch (err: unknown) {
    console.error("Upload error:", err);
    const errorMsg = err instanceof Error ? err.message : "upload failed";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
