// app/services/surveyService.ts
"use client";

import {
    db,
    uploadDataUrlAndGetURL,
} from "../../../firebaseConfig"; // ⬅️ ajusta si usas otra ruta
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
    qrId: string;                     // id del QR escaneado
    kind: "raw" | "framed" | null;    // opcional
    photoPath: string;                // ruta en Storage
    photoUrl: string;                 // URL de descarga
};

/* =========================
   Helpers internos
========================= */

function tsToDate(ts: any): Date | null {
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
        nombre: data.nombre,
        telefono: data.telefono,
        correo: data.correo,
        cargo: data.cargo,
        empresa: data.empresa,
        createdAt: tsToDate(data.createdAt),
        qrId: data.qrId,
        kind: (data.kind as "raw" | "framed" | null) ?? null,
        photoPath: data.photoPath,
        photoUrl: data.photoUrl,
    };
}

function makeFileId() {
    return (
        (globalThis.crypto?.randomUUID?.() as string | undefined) ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
}




export async function createSurveyRecord(input: {
    qrId: string;                     // viene de /survey?qrId=...
    kind?: "raw" | "framed" | null;   // opcional
    photoDataUrl: string;             // "data:image/png;base64,...."
} & SurveyForm): Promise<string> {

    // 1) Subir foto a Storage y obtener URL
    const fileId = makeFileId();
    const photoPath = `survey-submissions/${fileId}.png`;
    const photoUrl = await uploadDataUrlAndGetURL(photoPath, input.photoDataUrl);
    
    // 2) Guardar en Firestore
    const docRef = await addDoc(collection(db, "ImageGenerateIA"), {
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
   2) Obtener un registro por ID
========================= */
export async function getSurveyRecord(id: string): Promise<SurveyRecord | null> {
    const snap = await getDoc(doc(db, "surveys", id));
    if (!snap.exists()) return null;
    return mapDocToRecord(snap);
}

/* =========================
   3) Listar (ordenados por fecha desc) con paginación
========================= */
export async function listSurveyRecords(opts?: {
    pageSize?: number;          // por defecto 25
    cursorId?: string | null;   // id del último doc de la página anterior
}): Promise<{
    items: SurveyRecord[];
    nextCursorId: string | null;
}> {

    const size = Math.max(1, Math.min(opts?.pageSize ?? 25, 100));
    const baseQ = query(collection(db, "surveys"), orderBy("createdAt", "desc"));

    let q = baseQ;
    if (opts?.cursorId) {
        const cursorSnap = await getDoc(doc(db, "surveys", opts.cursorId));
        if (cursorSnap.exists()) {
            q = query(baseQ, startAfter(cursorSnap), fqLimit(size));
        } else {
            q = query(baseQ, fqLimit(size));
        }
    } else {
        q = query(baseQ, fqLimit(size));
    }

    const snap = await getDocs(q);
    const items = snap.docs.map(mapDocToRecord);
    const nextCursorId =
        snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;

    return { items, nextCursorId };
}

/* =========================
   4) Obtener URL de foto desde un record
========================= */
export function getPhotoUrlFromRecord(
    rec: { photoUrl?: string } | null
): string | null {
    return rec?.photoUrl ?? null;
}
