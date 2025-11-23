/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { db, getStorageOrThrow } from "../../firebaseConfig";
import {
    collection, doc, getDoc, getDocs,
    orderBy, query, startAfter, limit as fqLimit, Timestamp,
} from "firebase/firestore";
import {
    ref as storageRef, listAll, getDownloadURL, getMetadata,
    type StorageReference,
} from "firebase/storage";

// ⬇️ AÑADIDOS
type ZipLike = {
    file: (path: string, data: Blob | ArrayBuffer | Uint8Array) => void;
    generateAsync: (opts: { type: "blob" }) => Promise<Blob>;
};

export type PrintJob = {
    id: string;
    cargo?: string;
    correo?: string;
    createdAt: Date | null;
    empresa?: string;
    kind?: string;
    nombre?: string;
    photoPath?: string;
    url?: string | null;
    qrId?: string;
    telefono?: string;
};

export type PrintJobFile = {
    name: string;
    path: string;
    url: string;
    contentType?: string;
    size?: number;
};

const PRINT_JOBS_COLLECTION = "imageTasks";

/* ================== Helpers existentes ================== */
function tsToDate(ts: any): Date | null {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if ((ts as any)?.toDate) return (ts as any).toDate();
    if (ts instanceof Timestamp) return ts.toDate();
    return null;
}

function mapDocToJob(d: any): PrintJob {
    const data = d.data() as any;
    return {
        id: d.id,
        cargo: data.cargo ?? "",
        correo: data.correo ?? "",
        createdAt: tsToDate(data.createdAt),
        empresa: data.empresa ?? "",
        kind: data.kind ?? "",
        nombre: data.nombre ?? data.name ?? data.titulo ?? "",
        photoPath: data.photoPath ?? "",
        url: data.url ?? null,
        qrId: data.qrId ?? "",
        telefono: data.telefono ?? "",
    };
}

function pathFromStorageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        const m = u.pathname.match(/\/o\/([^?]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    } catch {
        return null;
    }
}

/* ================== Listado de archivos (existente) ================== */
async function listFilesFromFolderPath(folderPath: string, max = 100): Promise<PrintJobFile[]> {
    try {
        const storage = await getStorageOrThrow();
        const baseRef = storageRef(storage, folderPath);
        const listing = await listAll(baseRef);

        const items = listing.items.slice(0, max);
        const files = await Promise.all(
            items.map(async (itemRef) => {
                const [url, meta] = await Promise.all([
                    getDownloadURL(itemRef),
                    getMetadata(itemRef).catch(() => null),
                ]);
                return {
                    name: itemRef.name,
                    path: itemRef.fullPath,
                    url: url,
                    contentType: meta?.contentType,
                    size: meta ? Number(meta.size) : undefined,
                } as PrintJobFile;
            })
        );

        return files;
    } catch {
        return [];
    }
}

/* ================== NUEVO: Descarga masiva ================== */

/** Normaliza un input (PrintJob | string) a una ruta/URL válida para ref().
 *  Acepta:
 *   - "gs://bucket/path/..."
 *   - "https://firebasestorage.googleapis.com/..."
 *   - "carpeta/subcarpeta" (ruta relativa de tu bucket por defecto)
 *   - PrintJob con url (gs://, https) o con path relativo en data.url
 */
function resolveFolderInput(input: string | PrintJob): string | null {
    if (!input) return null;
    if (typeof input === "string") return input;

    // Es un PrintJob
    const job = input as PrintJob;
    if (job.url) {
        // Si viene gs:// o una ruta relativa, úsala tal cual
        if (job.url.startsWith("gs://") || /^[^:/]+\/.+/.test(job.url)) {
            return job.url;
        }
        // Si viene https, extrae /o/<path>
        const fromHttps = pathFromStorageUrl(job.url);
        if (fromHttps) return fromHttps;
    }
    // Fallback: intenta photoPath
    if (job.photoPath) return job.photoPath;
    return null;
}

/** Recorre recursivamente una carpeta y subcarpetas devolviendo refs de todos los items. */
async function collectFilesRecursively(folderPath: string): Promise<{ ref: StorageReference; fullPath: string }[]> {
    const storage = await getStorageOrThrow();
    const baseRef = storageRef(storage, folderPath);

    async function walk(dirRef: StorageReference, prefix = ""): Promise<{ ref: StorageReference; fullPath: string }[]> {
        const out: { ref: StorageReference; fullPath: string }[] = [];
        const res = await listAll(dirRef);

        // Archivos en este nivel
        for (const it of res.items) {
            out.push({ ref: it, fullPath: it.fullPath });
        }
        // Subcarpetas
        for (const p of res.prefixes) {
            const child = await walk(p, `${prefix}${p.name}/`);
            out.push(...child);
        }
        return out;
    }

    return walk(baseRef);
}

async function blobFromStorageRef(ref: StorageReference): Promise<Blob> {
    const url = await getDownloadURL(ref);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Fallo al descargar ${ref.fullPath}`);
    return await resp.blob();
}

/** Descarga una carpeta entera como ZIP. */
export async function downloadFolderAsZip(
    input: string | PrintJob,
    zipName = "imagenes.zip"
): Promise<void> {
    const folder = resolveFolderInput(input);
    if (!folder) throw new Error("No se pudo resolver la carpeta/URL del Storage.");

    // Carga dinámica de jszip (evita aumentar el bundle inicial)
    const JSZipMod = await import("jszip");
    const JSZip = (JSZipMod.default ?? JSZipMod) as unknown as new () => ZipLike;
    const zip = new (JSZip as any)() as ZipLike;

    const files = await collectFilesRecursively(folder);
    if (!files.length) throw new Error("La carpeta está vacía o no existe.");

    // Opcional: filtrar solo imágenes si quieres
    // const isImage = (ct?: string) => ct?.startsWith("image/");
    // (si quisieras metadata, tendrías que llamar getMetadata por cada ref)

    // Para mantener la estructura de carpetas dentro del zip,
    // usamos el fullPath relativo a la carpeta raíz solicitada.
    const basePath = typeof folder === "string" ? folder.replace(/^gs:\/\/[^/]+\/?/, "") : folder;
    const basePrefix = basePath.endsWith("/") ? basePath : `${basePath}/`;

    // Descarga concurrente controlada
    const CONCURRENCY = 4;
    let idx = 0;
    async function worker() {
        while (idx < files.length) {
            const current = idx++;
            const { ref, fullPath } = files[current];
            const blob = await blobFromStorageRef(ref);
            const relative = fullPath.startsWith(basePrefix) ? fullPath.slice(basePrefix.length) : ref.name;
            zip.file(relative, blob);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
}

/** Alternativa: dispara descargas individuales (puede ser bloqueado si son muchas). */
export async function downloadFilesIndividually(input: string | PrintJob): Promise<void> {
    const folder = resolveFolderInput(input);
    if (!folder) throw new Error("No se pudo resolver la carpeta/URL del Storage.");
    const files = await collectFilesRecursively(folder);
    if (!files.length) throw new Error("La carpeta está vacía o no existe.");

    for (const { ref } of files) {
        const url = await getDownloadURL(ref);
        const a = document.createElement("a");
        a.href = url;
        a.download = ref.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

/* ================== Tu función de listado con archivos (igual) ================== */
export async function listPrintJobsWithFiles(opts?: {
    pageSize?: number;
    cursorId?: string | null;
    includeFiles?: boolean;
    maxFilesPerJob?: number;
}): Promise<{
    items: (PrintJob & { files?: PrintJobFile[] })[];
    nextCursorId: string | null;
}> {
    const size = Math.max(1, Math.min(opts?.pageSize ?? 10, 100));
    const includeFiles = !!opts?.includeFiles;

    const baseQ = query(collection(db, "imageTasks"), orderBy("createdAt", "desc"));
    let q = baseQ;

    if (opts?.cursorId) {
        const cursorSnap = await getDoc(doc(db, PRINT_JOBS_COLLECTION, opts.cursorId));
        q = cursorSnap.exists()
            ? query(baseQ, startAfter(cursorSnap), fqLimit(size))
            : query(baseQ, fqLimit(size));
    } else {
        q = query(baseQ, fqLimit(size));
    }

    const snap = await getDocs(q);
    const jobs = snap.docs.map(mapDocToJob);

    if (includeFiles) {
        await Promise.all(
            jobs.map(async (job, i) => {
                let path: string | null = null;
                if (job.url) {
                    if (job.url.startsWith("gs://") || job.url.startsWith("printJobs/")) {
                        path = job.url;
                    } else {
                        path = pathFromStorageUrl(job.url);
                    }
                }
                if (!path) return;
                const files = await listFilesFromFolderPath(path);
                (jobs[i] as PrintJob & { files?: PrintJobFile[] }).files = files;
            })
        );
    }

    const nextCursorId = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;
    return { items: jobs as (PrintJob & { files?: PrintJobFile[] })[], nextCursorId };
}

export async function listPrintJobsWithFilesVideo(opts?: {
    pageSize?: number;
    cursorId?: string | null;
    includeFiles?: boolean;
    maxFilesPerJob?: number;
}): Promise<{
    items: (PrintJob & { files?: PrintJobFile[] })[];
    nextCursorId: string | null;
}> {
    const size = Math.max(1, Math.min(opts?.pageSize ?? 10, 100));
    const includeFiles = !!opts?.includeFiles;

    const baseQ = query(collection(db, "videoTasks"), orderBy("createdAt", "desc"));
    let q = baseQ;

    if (opts?.cursorId) {
        const cursorSnap = await getDoc(doc(db, PRINT_JOBS_COLLECTION, opts.cursorId));
        q = cursorSnap.exists()
            ? query(baseQ, startAfter(cursorSnap), fqLimit(size))
            : query(baseQ, fqLimit(size));
    } else {
        q = query(baseQ, fqLimit(size));
    }

    const snap = await getDocs(q);
    const jobs = snap.docs.map(mapDocToJob);

    if (includeFiles) {
        await Promise.all(
            jobs.map(async (job, i) => {
                let path: string | null = null;
                if (job.url) {
                    if (job.url.startsWith("gs://") || job.url.startsWith("printJobs/")) {
                        path = job.url;
                    } else {
                        path = pathFromStorageUrl(job.url);
                    }
                }
                if (!path) return;
                const files = await listFilesFromFolderPath(path);
                (jobs[i] as PrintJob & { files?: PrintJobFile[] }).files = files;
            })
        );
    }

    const nextCursorId = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;
    return { items: jobs as (PrintJob & { files?: PrintJobFile[] })[], nextCursorId };
}

