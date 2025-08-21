/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { db, getStorageOrThrow } from "../../firebaseConfig"; // 👈 aquí
import {
    collection, doc, getDoc, getDocs,
    orderBy, query, startAfter, limit as fqLimit, Timestamp,
} from "firebase/firestore";
import {
    ref as storageRef, listAll, getDownloadURL, getMetadata,
} from "firebase/storage";

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

async function listFilesFromFolderPath(folderPath: string, max = 100): Promise<PrintJobFile[]> {
    try {
        const storage = await getStorageOrThrow();                // 👈 pedir Storage aquí
        console.log("storage", storage);

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
    const maxFiles = Math.max(1, Math.min(opts?.maxFilesPerJob ?? 50, 500));

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
                // Si el campo es una URL, extrae la carpeta; si es una ruta, úsala directamente
                let path: string | null = null;
                if (job.url) {
                    if (job.url.startsWith("gs://") || job.url.startsWith("printJobs/")) {
                        path = job.url;
                    } else {
                        path = pathFromStorageUrl(job.url);
                    }
                }
                if (!path) return;
                const files = await listFilesFromFolderPath(path, maxFiles);
                (jobs[i] as PrintJob & { files?: PrintJobFile[] }).files = files;
            })
        );
    }

    const nextCursorId = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;
    return { items: jobs as (PrintJob & { files?: PrintJobFile[] })[], nextCursorId };
}
