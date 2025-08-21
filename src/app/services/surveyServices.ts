/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/services/surveyService.ts
"use client";

import { db, uploadDataUrlAndGetURL } from "../../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  limit as fqLimit,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  limit as fqLimit,
  Timestamp,
} from "firebase/firestore";

/* =========================
   Tipos
========================= */

export type SurveyForm = {
  nombre: string;
  telefono: string;
  correo: string;
  cargo: string;
  empresa: string;
  nombre: string;
  telefono: string;
  correo: string;
  cargo: string;
  empresa: string;
};

export type SurveyRecord = SurveyForm & {
  id: string;
  createdAt: Date | null;
  qrId: string;                    // id del QR escaneado
  kind: "raw" | "framed" | null;   // opcional
  photoPath: string | null;        // ruta en Storage (puede ser null en quick)
  photoUrl: string;                // URL de descarga (http/https o data:)
};

/* =========================
   Config
========================= */

const COLLECTION = "ImageGenerateIA";

/* =========================
   Helpers internos
========================= */

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Timestamp) return ts.toDate();
  return null;
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Timestamp) return ts.toDate();
  return null;
}

function mapDocToRecord(d: any): SurveyRecord {
  const data = d.data() as any;
  return {
    id: d.id,
    nombre: data.nombre ?? "",
    telefono: data.telefono ?? "",
    correo: data.correo ?? "",
    cargo: data.cargo ?? "",
    empresa: data.empresa ?? "",
    createdAt: tsToDate(data.createdAt),
    qrId: data.qrId ?? "",
    kind: (data.kind as "raw" | "framed" | null) ?? null,
    photoPath: data.photoPath ?? null,
    photoUrl: data.photoUrl ?? "",
  };
  const data = d.data() as any;
  return {
    id: d.id,
    nombre: data.nombre ?? "",
    telefono: data.telefono ?? "",
    correo: data.correo ?? "",
    cargo: data.cargo ?? "",
    empresa: data.empresa ?? "",
    createdAt: tsToDate(data.createdAt),
    qrId: data.qrId ?? "",
    kind: (data.kind as "raw" | "framed" | null) ?? null,
    photoPath: data.photoPath ?? null,
    photoUrl: data.photoUrl ?? "",
  };
}

function makeFileId() {
  try {
    // @ts-ignore
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID() as string;
  } catch {}
  // ✅ corregido: backticks
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* =========================
   0) Nuevo: subir imagen vía API (evita CORS)
   POST /api/storage/upload  -> { url, path }
========================= */
async function uploadImageViaAPI(params: {
  dataUrl: string;       // "data:image/png;base64,..."
  desiredPath?: string;  // ruta en Storage (opcional)
}): Promise<{ url: string; path: string }> {
  const res = await fetch("/api/storage/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fallo subiendo imagen: ${res.status} ${text}`);
  }

  return res.json();
}

/* =========================
   1) Crear (cuando tienes dataURL) SUBIENDO DESDE CLIENTE CON SDK
   - Sube con uploadDataUrlAndGetURL y guarda photoUrl/photoPath
========================= */
export async function createSurveyRecord(
  input: {
    qrId: string;
    kind?: "raw" | "framed" | null;
    photoDataUrl: string;
  } & SurveyForm
): Promise<string> {
  const fileId = makeFileId();
  // ✅ corregido: backticks
  const photoPath = `survey-submissions/${fileId}.png`;
  const photoUrl = await uploadDataUrlAndGetURL(photoPath, input.photoDataUrl);

  const docRef = await addDoc(collection(db, COLLECTION), {
    nombre: input.nombre,
    telefono: input.telefono,
    correo: input.correo,
    cargo: input.cargo,
    empresa: input.empresa,
    createdAt: serverTimestamp(),
    qrId: input.qrId,
    kind: input.kind ?? null,
    photoPath,
    photoUrl,
  });

  return docRef.id;
}

/* =========================
   1.1) Crear usando FETCH a tu API (recomendado si hay CORS)
   - El server guarda en Storage y devuelve url/path
========================= */
export async function createSurveyRecordViaFetch(
  input: {
    qrId: string;
    kind?: "raw" | "framed" | null;
    photoDataUrl: string; // "data:image/png;base64,..."
    pathHint?: string;    // opcional: prefijo/carpeta
  } & SurveyForm
): Promise<string> {
  const fileId = makeFileId();
  const desiredPath = `${input.pathHint ?? "survey-submissions"}/${fileId}.png`;

  const { url: photoUrl, path: photoPath } = await uploadImageViaAPI({
    dataUrl: input.photoDataUrl,
    desiredPath,
  });

  const docRef = await addDoc(collection(db, COLLECTION), {
    nombre: input.nombre,
    telefono: input.telefono,
    correo: input.correo,
    cargo: input.cargo,
    empresa: input.empresa,
    createdAt: serverTimestamp(),
    qrId: input.qrId,
    kind: input.kind ?? null,
    photoPath,
    photoUrl,
  });

  return docRef.id;
}

/* =========================
   1.2) (Opcional) Crear dos registros a la vez (raw + framed)
   - Sube ambas imágenes por fetch en paralelo
========================= */
export async function createPairRecordsViaFetch(
  input: {
    qrId: string;
    rawDataUrl: string;
    framedDataUrl: string;
  } & SurveyForm
): Promise<{ rawId: string; framedId: string }> {
  const [rawUpload, framedUpload] = await Promise.all([
    uploadImageViaAPI({ dataUrl: input.rawDataUrl, desiredPath: `survey-submissions/${makeFileId()}-raw.png` }),
    uploadImageViaAPI({ dataUrl: input.framedDataUrl, desiredPath: `survey-submissions/${makeFileId()}-framed.png` }),
  ]);

  const coll = collection(db, COLLECTION);

  const [rawRef, framedRef] = await Promise.all([
    addDoc(coll, {
      nombre: input.nombre,
      telefono: input.telefono,
      correo: input.correo,
      cargo: input.cargo,
      empresa: input.empresa,
      createdAt: serverTimestamp(),
      qrId: input.qrId,
      kind: "raw",
      photoPath: rawUpload.path,
      photoUrl: rawUpload.url,
    }),
    addDoc(coll, {
      nombre: input.nombre,
      telefono: input.telefono,
      correo: input.correo,
      cargo: input.cargo,
      empresa: input.empresa,
      createdAt: serverTimestamp(),
      qrId: input.qrId,
      kind: "framed",
      photoPath: framedUpload.path,
      photoUrl: framedUpload.url,
    }),
  ]);

  return { rawId: rawRef.id, framedId: framedRef.id };
}

/* =========================
   1.3) Crear (rápido) cuando ya tienes URL http/https
========================= */
export async function createSurveyRecordQuick(
  input: {
    qrId: string;
    kind?: "raw" | "framed" | null;
    photoUrl: string; // http/https o data:
  } & SurveyForm
): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    nombre: input.nombre,
    telefono: input.telefono,
    correo: input.correo,
    cargo: input.cargo,
    empresa: input.empresa,
    createdAt: serverTimestamp(),
    qrId: input.qrId,
    kind: input.kind ?? null,
    photoPath: null,
    photoUrl: input.photoUrl,
  });

  return docRef.id;
  return docRef.id;
}

/* =========================
   2) Obtener un registro por ID
========================= */
export async function getSurveyRecord(id: string): Promise<SurveyRecord | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return mapDocToRecord(snap);
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return mapDocToRecord(snap);
}

/* =========================
   3) Listar (fecha desc) con paginación
========================= */
export async function listSurveyRecords(opts?: {
  pageSize?: number;
  cursorId?: string | null;
}): Promise<{
  items: SurveyRecord[];
  nextCursorId: string | null;
  items: SurveyRecord[];
  nextCursorId: string | null;
}> {
  const size = Math.max(1, Math.min(opts?.pageSize ?? 25, 100));
  const baseQ = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const size = Math.max(1, Math.min(opts?.pageSize ?? 25, 100));
  const baseQ = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));

  let q = baseQ;
  if (opts?.cursorId) {
    const cursorSnap = await getDoc(doc(db, COLLECTION, opts.cursorId));
    q = cursorSnap.exists()
      ? query(baseQ, startAfter(cursorSnap), fqLimit(size))
      : query(baseQ, fqLimit(size));
  } else {
    q = query(baseQ, fqLimit(size));
  }
  let q = baseQ;
  if (opts?.cursorId) {
    const cursorSnap = await getDoc(doc(db, COLLECTION, opts.cursorId));
    q = cursorSnap.exists()
      ? query(baseQ, startAfter(cursorSnap), fqLimit(size))
      : query(baseQ, fqLimit(size));
  } else {
    q = query(baseQ, fqLimit(size));
  }

  const snap = await getDocs(q);
  const items = snap.docs.map(mapDocToRecord);
  const nextCursorId = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;
  const snap = await getDocs(q);
  const items = snap.docs.map(mapDocToRecord);
  const nextCursorId = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;

  return { items, nextCursorId };
  return { items, nextCursorId };
}

/* =========================
   4) Helper para extraer la URL
   4) Helper para extraer la URL
========================= */
export function getPhotoUrlFromRecord(rec: { photoUrl?: string } | null): string | null {
  return rec?.photoUrl ?? null;
export function getPhotoUrlFromRecord(rec: { photoUrl?: string } | null): string | null {
  return rec?.photoUrl ?? null;
}
