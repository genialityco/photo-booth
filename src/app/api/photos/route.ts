// app/api/photos/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Secret Manager Client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let secretManagerClient: any = null;

async function getSecretManagerClient() {
  if (!secretManagerClient) {
    try {
      const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
      const gcloudKey = process.env.GCLOUD_KEY;
      
      if (gcloudKey) {
        try {
          const credentials = JSON.parse(gcloudKey);
          secretManagerClient = new SecretManagerServiceClient({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            credentials: credentials as any,
          });
          console.log("✓ Secret Manager client inicializado con GCLOUD_KEY (photos)");
        } catch (parseErr) {
          console.warn("⚠️ Error parseando GCLOUD_KEY:", (parseErr as Error).message);
          secretManagerClient = new SecretManagerServiceClient();
        }
      } else {
        secretManagerClient = new SecretManagerServiceClient();
      }
    } catch (err) {
      console.warn("Secret Manager not available:", (err as Error).message);
      return null;
    }
  }
  return secretManagerClient;
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
        console.log("✓ Credenciales cargadas desde archivo (photos)");
        return JSON.parse(content);
      } catch (err) {
        console.warn("⚠️ Error leyendo credenciales del archivo:", (err as Error).message);
      }
    }
  }

  // Opción 2: Reconstruir desde variables de entorno divididas (Netlify)
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    try {
      const credentials = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
        private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID || "",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
        universe_domain: "googleapis.com"
      };
      console.log("✓ Credenciales reconstruidas desde variables de entorno divididas (photos)");
      return credentials;
    } catch (err) {
      console.warn("⚠️ Error reconstruyendo credenciales:", (err as Error).message);
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

  throw new Error("No se encontraron credenciales de Firebase - verifícalas en variables de entorno");
}

async function getServiceAccountFromSecretManager() {
  const client = await getSecretManagerClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || "472633703949";
  
  if (!client) {
    return null;
  }
  
  try {
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/secretPhotobooth/versions/latest`,
    });
    const payload = version.payload.data.toString('utf8');
    console.log("✓ Credenciales cargadas desde Secret Manager (photos)");
    return JSON.parse(payload);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.code !== 5 && err.code !== 7) {
      console.warn("⚠️ Error accediendo Secret Manager:", err.message);
    }
    return null;
  }
}

async function initializeAdminIfNeededWithSecrets() {
  if (!admin.apps.length) {
    // Intentar Secret Manager primero, luego fallback
    let serviceAccount = await getServiceAccountFromSecretManager();
    if (!serviceAccount) {
      serviceAccount = getServiceAccount();
    }
    
    admin.initializeApp({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credential: admin.credential.cert(serviceAccount as any),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "lenovo-experiences.appspot.com",
    });
    console.log("✓ Firebase Admin initialized successfully (photos)");
  }
}

const bucket = async () => {
  await initializeAdminIfNeededWithSecrets();
  return admin.storage().bucket();
};

const afs = async () => {
  await initializeAdminIfNeededWithSecrets();
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
        const { rawDataUrl, framedDataUrl, qrId, meta } = await req.json();

        // Generar nombres
        const now = Date.now();
        const id = `${now}-${Math.random().toString(36).slice(2)}`;
        const paths: { raw?: string; framed?: string } = {};
        const urls: { raw?: string; framed?: string } = {};

        if (!rawDataUrl && !framedDataUrl) {
            return NextResponse.json({ error: "Falta rawDataUrl o framedDataUrl" }, { status: 400 });
        }

        const storageBucket = await bucket();
        const firestoreDb = await afs();

        // Subir RAW
        if (rawDataUrl) {
            const { buffer, contentType } = parseDataUrl(rawDataUrl);
            const path = `survey-submissions/${id}-raw.png`;
            const f = storageBucket.file(path);
            await f.save(buffer, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
            await f.makePublic();
            const url = `https://storage.googleapis.com/${storageBucket.name}/${encodeURIComponent(path)}`;
            paths.raw = path;
            urls.raw = url;
        }

        // Subir FRAMED
        if (framedDataUrl) {
            const { buffer, contentType } = parseDataUrl(framedDataUrl);
            const path = `survey-submissions/${id}-framed.png`;
            const f = storageBucket.file(path);
            await f.save(buffer, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
            await f.makePublic();
            const url = `https://storage.googleapis.com/${storageBucket.name}/${encodeURIComponent(path)}`;
            paths.framed = path;
            urls.framed = url;
        }

        // Crear documento en Firestore
        const docRef = await firestoreDb.collection("surveys").add({
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
