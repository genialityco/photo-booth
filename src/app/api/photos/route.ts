// app/api/photos/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

function getServiceAccount() {
  // Intentar leer del archivo primero (Netlify)
  const filePath = path.join(process.cwd(), "firebaseServiceAccount.json");
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      console.log("✓ Credenciales cargadas desde archivo (photos)");
      return JSON.parse(content);
    } catch (err) {
      console.warn("⚠️ Error leyendo credenciales del archivo:", (err as Error).message);
    }
  }

  // Fallback: decodificar desde variable de entorno (desarrollo local)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8');
      console.log("✓ Credenciales cargadas desde variable de entorno (photos)");
      return JSON.parse(decoded);
    } catch (err) {
      console.warn("⚠️ Error decodificando credenciales:", (err as Error).message);
    }
  }

  throw new Error("No se encontraron credenciales de Firebase - verifícalas en FIREBASE_SERVICE_ACCOUNT o firebaseServiceAccount.json");
}

function initializeAdminIfNeeded() {
  if (!admin.apps.length) {
    const serviceAccount = getServiceAccount();
    admin.initializeApp({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credential: admin.credential.cert(serviceAccount as any),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "lenovo-experiences.appspot.com",
    });
    console.log("✓ Firebase Admin initialized successfully (photos)");
  }
}

const bucket = () => {
  initializeAdminIfNeeded();
  return admin.storage().bucket();
};

const afs = () => {
  initializeAdminIfNeeded();
  return admin.firestore();
};

function parseDataUrl(dataUrl: string) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
    if (!m) throw new Error("dataUrl inválido");
    const contentType = m[1];
    const buffer = Buffer.from(m[2], "base64");
    return { contentType, buffer };
}

export async function POST(req: NextRequest) {
    try {
        // Forma JSON: { rawDataUrl?, framedDataUrl?, qrId?, meta? }
        // (Si prefieres multipart, puedo pasarte variante; con JSON es más simple)
        const { rawDataUrl, framedDataUrl, qrId, meta } = await req.json();

        // Generar nombres
        const now = Date.now();
        const id = `${now}-${Math.random().toString(36).slice(2)}`;
        const paths: { raw?: string; framed?: string } = {};
        const urls: { raw?: string; framed?: string } = {};

        if (!rawDataUrl && !framedDataUrl) {
            return NextResponse.json({ error: "Falta rawDataUrl o framedDataUrl" }, { status: 400 });
        }

        // Subir RAW
        if (rawDataUrl) {
            const { buffer, contentType } = parseDataUrl(rawDataUrl);
            const path = `survey-submissions/${id}-raw.png`;
            const f = bucket().file(path);
            await f.save(buffer, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
            await f.makePublic();
            const url = `https://storage.googleapis.com/${bucket().name}/${encodeURIComponent(path)}`;
            paths.raw = path;
            urls.raw = url;
        }

        // Subir FRAMED
        if (framedDataUrl) {
            const { buffer, contentType } = parseDataUrl(framedDataUrl);
            const path = `survey-submissions/${id}-framed.png`;
            const f = bucket().file(path);
            await f.save(buffer, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
            await f.makePublic();
            const url = `https://storage.googleapis.com/${bucket().name}/${encodeURIComponent(path)}`;
            paths.framed = path;
            urls.framed = url;
        }

        // Crear documento en Firestore
        const docRef = await afs().collection("surveys").add({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            qrId: qrId ?? null,
            ...((meta && typeof meta === "object") ? meta : {}),
            photoRawPath: paths.raw ?? null,
            photoRawUrl: urls.raw ?? null,
            photoFramedPath: paths.framed ?? null,
            photoFramedUrl: urls.framed ?? null,
        });

        return NextResponse.json({
            docId: docRef.id,
            rawUrl: urls.raw || null,
            framedUrl: urls.framed || null,
        });
    } catch (e: unknown) {
        console.error(e);
        const errorMsg = e instanceof Error ? e.message : "Upload failed";
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
