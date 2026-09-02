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

// El bucket se resuelve con la misma cadena de fallbacks que usan
// `api/storage/upload` y `api/photos`: `FIREBASE_STORAGE_BUCKET` solo está
// documentada para Netlify y no existe en los `.env` locales, así que sin
// fallback el SDK arranca sin bucket y `.bucket()` revienta con
// "Bucket name not specified or invalid".
function getStorageBucket() {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "lenovo-experiences"}.appspot.com`
  );
}

export function getAdminApp() {
  if (app) return app;

  // Si otro route ya inicializó la app default (`api/photos`,
  // `api/storage/upload` lo hacen con su propia cadena de credenciales), se
  // reutiliza — no hace falta volver a resolver el service account acá.
  if (admin.apps.length) {
    app = admin.app();
    return app;
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    console.warn("⚠️ Credenciales de Firebase Admin no disponibles - funcionalidades del servidor deshabilitadas");
    return undefined;
  }

  try {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: getStorageBucket(),
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
  // Nombre explícito: si la app default la inicializó otro route, su
  // storageBucket puede venir vacío y `.bucket()` sin argumento falla.
  const bucket = admin.storage(a).bucket(getStorageBucket());
  return { admin, db, bucket };
}
