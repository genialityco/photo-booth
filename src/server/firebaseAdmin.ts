import admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

let app: admin.app.App | undefined;

// Leer credenciales de archivo JSON
const getServiceAccount = () => {
  try {
    // Intentar leer desde archivo local (desarrollo y Netlify)
    const filePath = path.join(process.cwd(), "firebaseServiceAccount.json");
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(fileContent);
    }
    
    // Fallback: decodificar desde variable de entorno (si existe)
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    }
    
    return null;
  } catch (err) {
    console.error("❌ Error cargando credenciales de Firebase:", err);
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
  } catch (err) {
    console.error("❌ Error inicializando Firebase Admin:", err);
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
