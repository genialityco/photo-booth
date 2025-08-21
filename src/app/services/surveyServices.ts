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

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && ts !== null && "toDate" in ts && typeof (ts as any).toDate === "function") {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (ts instanceof Timestamp) return ts.toDate();
  return null;
}

import type { DocumentSnapshot } from "firebase/firestore";
function mapDocToRecord(d: DocumentSnapshot): SurveyRecord {
  const data = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    nombre: typeof data.nombre === "string" ? data.nombre : "",
    telefono: typeof data.telefono === "string" ? data.telefono : "",
    correo: typeof data.correo === "string" ? data.correo : "",
    cargo: typeof data.cargo === "string" ? data.cargo : "",
    empresa: typeof data.empresa === "string" ? data.empresa : "",
    createdAt: tsToDate(data.createdAt),
    qrId: typeof data.qrId === "string" ? data.qrId : "",
    kind: (data.kind === "raw" || data.kind === "framed") ? data.kind : null,
    photoPath: typeof data.photoPath === "string" ? data.photoPath : null,
    photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : "",
  };
}

function makeFileId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID() as string;
  } catch { }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* =========================
   0) Subir imagen vía API (evita CORS)
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
   1) Crear (dataURL) usando SDK del cliente
========================= */
export async function createSurveyRecord(
  input: {
    qrId: string;
    kind?: "raw" | "framed" | null;
    photoDataUrl: string;
  } & SurveyForm
): Promise<string> {
  const fileId = makeFileId();
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
   1.1) Crear usando tu API (recomendado si hay CORS)
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
   1.2) Crear dos registros (raw + framed) vía API
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
   1.3) Crear cuando ya tienes una URL http/https (o data:)
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
}

/* =========================
   2) Obtener un registro por ID
========================= */
export async function getSurveyRecord(id: string): Promise<SurveyRecord | null> {
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
}> {
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

  const snap = await getDocs(q);
  const items = snap.docs.map(mapDocToRecord);
  const nextCursorId = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;

  return { items, nextCursorId };
}

/* =========================
   4) Helper para extraer la URL
========================= */
export function getPhotoUrlFromRecord(rec: { photoUrl?: string } | null): string | null {
  return rec?.photoUrl ?? null;
}
