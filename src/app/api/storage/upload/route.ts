import { getApps, initializeApp, cert } from "firebase-admin/app";
// app/api/storage/upload/route.ts
import { NextRequest } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";

function getStorageBucket() {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
         `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "lenovo-experiences"}.appspot.com`;
}

function getServiceAccount() {
  // Intentar leer del archivo primero (Netlify publica en .next/)
  const possiblePaths = [
    path.join(process.cwd(), ".next", "firebaseServiceAccount.json"),
    path.join(process.cwd(), "firebaseServiceAccount.json"),
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        console.log("✓ Credenciales cargadas desde archivo");
        return JSON.parse(content);
      } catch (err) {
        console.warn("⚠️ Error leyendo credenciales del archivo:", (err as Error).message);
      }
    }
  }

  // Fallback: decodificar desde variable de entorno (desarrollo local)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8');
      console.log("✓ Credenciales cargadas desde variable de entorno");
      return JSON.parse(decoded);
    } catch (err) {
      console.warn("⚠️ Error decodificando credenciales:", (err as Error).message);
    }
  }

  throw new Error("No se encontraron credenciales de Firebase - verifícalas en FIREBASE_SERVICE_ACCOUNT o firebaseServiceAccount.json");
}

function initAdmin() {
  if (!getApps().length) {
    const storageBucket = getStorageBucket();
    
    console.log("Initializing Firebase Admin with bucket:", storageBucket);
    
    const serviceAccount = getServiceAccount();
    
    initializeApp({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credential: cert(serviceAccount as any),
      storageBucket,
    });
    
    console.log("✓ Firebase Admin initialized successfully");
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
