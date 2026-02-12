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
    
    // Fallback: decodificar desde variable de entorno (si existe)
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (encoded) {
      console.log("⚠️ Usando credenciales desde variable de entorno");
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      return JSON.parse(decoded);
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
