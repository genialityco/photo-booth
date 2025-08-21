import admin from "firebase-admin";

let app: admin.app.App | undefined;

export function getAdminApp() {
  if (app) return app;

  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) throw new Error("FIREBASE_SERVICE_ACCOUNT no definido");

  const serviceAccount = JSON.parse(saRaw);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  return app;
}

export function getAdminServices() {
  const a = getAdminApp();
  const db = admin.firestore(a);
  const bucket = admin.storage(a).bucket();
  return { admin, db, bucket };
}
