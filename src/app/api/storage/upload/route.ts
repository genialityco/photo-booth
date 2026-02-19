import { getApps, initializeApp, cert } from "firebase-admin/app";
// app/api/storage/upload/route.ts
import { NextRequest } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
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
          console.log("✓ Secret Manager client inicializado con GCLOUD_KEY");
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
      console.log("✓ Credenciales reconstruidas desde variables de entorno divididas");
      return credentials;
    } catch (err) {
      console.warn("⚠️ Error reconstruyendo credenciales:", (err as Error).message);
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
    console.log("✓ Credenciales cargadas desde Secret Manager");
    return JSON.parse(payload);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.code !== 5 && err.code !== 7) { // 5=NOT_FOUND, 7=PERMISSION_DENIED
      console.warn("⚠️ Error accediendo Secret Manager:", err.message);
    }
    return null;
  }
}

async function initAdminWithSecrets() {
  if (!getApps().length) {
    const storageBucket = getStorageBucket();
    
    console.log("Initializing Firebase Admin with bucket:", storageBucket);
    
    // Intentar Secret Manager primero, luego fallback
    let serviceAccount = await getServiceAccountFromSecretManager();
    if (!serviceAccount) {
      serviceAccount = getServiceAccount();
    }
    
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
    await initAdminWithSecrets();

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
