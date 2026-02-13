import admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

let app: admin.app.App | undefined;

// Leer credenciales de archivo JSON
const getServiceAccount = () => {
  try {
    // Intentar múltiples rutas posibles
    const possiblePaths = [
      path.join(process.cwd(), "firebaseServiceAccount.json"),
      path.join(__dirname, "../../firebaseServiceAccount.json"),
      path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", "firebaseServiceAccount.json"),
    ];
    
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        try {
          const fileContent = fs.readFileSync(filePath, "utf-8");
          console.log(`✓ Credenciales cargadas desde: ${filePath}`);
          return JSON.parse(fileContent);
        } catch (err) {
          console.warn(`⚠️ Error al leer ${filePath}:`, (err as Error).message);
        }
      }
    }
    
    // Fallback: intentar desde variable de entorno
    const envvar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envvar) {
      try {
        console.log("⚠️ Usando credenciales desde variable de entorno");
        // Reemplazar \\n escapados por saltos de línea reales
        const unescaped = envvar.replace(/\\n/g, '\n');
        // Intentar parsear como JSON directo
        return JSON.parse(unescaped);
      } catch (err) {
        try {
          // Si falla, intentar decodificar como Base64
          const decoded = Buffer.from(envvar, 'base64').toString('utf-8');
          return JSON.parse(decoded);
        } catch (base64Err) {
          console.warn("⚠️ No se pudieron parsear credenciales de FIREBASE_SERVICE_ACCOUNT:", (err as Error).message);
        }
      }
    }
    
    console.warn("⚠️ No se encontraron credenciales de Firebase");
    return null;
  } catch (err) {
    console.error("❌ Error cargando credenciales de Firebase:", (err as Error).message);
    return null;
  }
};

export function getAdminApp() {
  if (app) return app;

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    console.warn("⚠️ Credenciales de Firebase Admin no disponibles - funcionalidades del servidor deshabilitadas");
    return undefined;
  }

  try {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    console.log("✓ Firebase Admin SDK inicializado exitosamente");
  } catch (err) {
    console.error("❌ Error inicializando Firebase Admin:", (err as Error).message);
    return undefined;
  }

  return app;
}

export function getAdminServices() {
  const a = getAdminApp();
  if (!a) {
    throw new Error("Firebase Admin no inicializado. Configura FIREBASE_SERVICE_ACCOUNT");
  }
  const db = admin.firestore(a);
  const bucket = admin.storage(a).bucket();
  return { admin, db, bucket };
}
