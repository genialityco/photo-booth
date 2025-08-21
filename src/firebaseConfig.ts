// firebaseConfig.ts  ✅ SEGURO para server y client (sin APIs de navegador en top-level)
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!,
};


export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firestore es seguro crearlo aquí (isomorphic)
export const db = getFirestore(app);

// ===== Helpers SOLO navegador =====
const isBrowser = () =>
  typeof window !== "undefined" && typeof navigator !== "undefined";

/** Auth solo en navegador (con persistencia local) */
export async function getAuthBrowser() {
  if (!isBrowser()) return null;
  const { getAuth, setPersistence, browserLocalPersistence } = await import(
    "firebase/auth"
  );
  const auth = getAuth(app);
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("Auth persistence error:", e);
  }
  return auth;
}

/** Messaging solo si es soportado por el navegador */
export async function getMessagingBrowser() {
  if (!isBrowser()) return null;
  try {
    const { isSupported, getMessaging } = await import("firebase/messaging");
    if (await isSupported()) return getMessaging(app);
  } catch (e) {
    console.warn("Messaging not available:", e);
  }
  return null;
}

/** ✅ STORAGE (browser-only) */
export async function getStorageBrowser() {
  if (!isBrowser()) return null;
  const { getStorage } = await import("firebase/storage");
  return getStorage(app);
}

/** (Opcional) Helper: obtiene Storage o lanza error si no estás en navegador */
export async function getStorageOrThrow() {
  const storage = await getStorageBrowser();
  if (!storage) {
    throw new Error("Firebase Storage solo está disponible en el navegador.");
  }
  return storage;
}

/** (Opcional) Helper: sube un dataURL a Storage y retorna su downloadURL */
export async function uploadDataUrlAndGetURL(path: string, dataUrl: string) {
  const storage = await getStorageOrThrow();
  const { ref, uploadString, getDownloadURL } = await import("firebase/storage");
  const r = ref(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return getDownloadURL(r);
}
