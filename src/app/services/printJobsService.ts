// app/services/printTasksService.ts
"use client";

import { getStorageOrThrow } from "../../firebaseConfig";
import {
  ref as storageRef,
  list,
  listAll,
  getDownloadURL,
  getMetadata,
  type ListOptions,
} from "firebase/storage";

export type TaskFolder = {
  taskId: string;            // nombre de la carpeta en prints/
  coverUrl?: string | null;  // primera imagen (más reciente) como portada
  createdAt?: number | null; // timestamp del archivo más antiguo
  updatedAt?: number | null; // timestamp del archivo más reciente
  files?: TaskFile[];        // archivos de la carpeta (si includeFiles = true)
};

export type TaskFile = {
  name: string;
  path: string;        // prints/{taskId}/{file}
  photoUrl: string;    // downloadURL
  contentType?: string;
  size?: number;
  updatedAt?: number;  // millis
};

export async function listPrintTaskFolders(opts?: {
  pageSize?: number;         // cuántas carpetas (tasks) por página
  cursor?: string | null;    // pageToken devuelto por list() sobre prints/
  includeFiles?: boolean;    // si quieres traer los archivos de cada carpeta
  maxFilesPerTask?: number;  // tope de archivos por carpeta
}): Promise<{ items: TaskFolder[]; nextCursor: string | null }> {
  const pageSize = Math.max(1, Math.min(opts?.pageSize ?? 6, 100));
  const includeFiles = !!opts?.includeFiles;
  const maxFilesPerTask = Math.max(1, Math.min(opts?.maxFilesPerTask ?? 100, 500));

  const storage = await getStorageOrThrow();
  const base = storageRef(storage, "prints");

  // 1) Listar subcarpetas (prefixes) de prints/
  const options: ListOptions = {
    maxResults: pageSize,
    pageToken: opts?.cursor || undefined,
  };
  const { prefixes, nextPageToken } = await list(base, options);

  // 2) Para cada carpeta, listar archivos (si includeFiles)
  const items: TaskFolder[] = [];

  for (const folderRef of prefixes) {
    const taskId = folderRef.name;

    let files: TaskFile[] | undefined;
    let coverUrl: string | null | undefined = null;
    let createdAt: number | null | undefined = null;
    let updatedAt: number | null | undefined = null;

    if (includeFiles) {
      const { items: fileRefs } = await listAll(folderRef); // si hay MUCHO, cambia a list() con paginación interna
      const limited = fileRefs.slice(0, maxFilesPerTask);

      const enriched = await Promise.all(
        limited.map(async (fileRef) => {
          const [url, meta] = await Promise.all([
            getDownloadURL(fileRef),
            getMetadata(fileRef).catch(() => null),
          ]);
          const f: TaskFile = {
            name: fileRef.name,
            path: fileRef.fullPath,
            photoUrl: url,
            contentType: meta?.contentType,
            size: meta ? Number(meta.size) : undefined,
            updatedAt: meta?.updated ? Date.parse(meta.updated) : undefined,
          };
          return f;
        })
      );

      // Ordenar por actualizado desc → portada = más reciente
      enriched.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      files = enriched;

      if (files.length) {
        coverUrl = files[0].photoUrl;
        const times = files
          .map((f) => f.updatedAt || 0)
          .filter(Boolean)
          .sort((a, b) => a - b);
        if (times.length) {
          createdAt = times[0];
          updatedAt = times[times.length - 1];
        }
      }
    } else {
      // Si no quieres archivos, al menos intenta una portada rápida
      const { items: one } = await list(folderRef, { maxResults: 1 });
      if (one.length) coverUrl = await getDownloadURL(one[0]);
    }

    items.push({
      taskId,
      coverUrl,
      createdAt: createdAt ?? null,
      updatedAt: updatedAt ?? null,
      files,
    });
  }

  // 🔥 Ordenar carpetas de más recientes a más antiguas (updatedAt desc, luego createdAt desc, luego taskId)
  items.sort((a, b) => {
    const ua = a.updatedAt ?? 0;
    const ub = b.updatedAt ?? 0;
    if (ub !== ua) return ub - ua;

    const ca = a.createdAt ?? 0;
    const cb = b.createdAt ?? 0;
    if (cb !== ca) return cb - ca;

    return b.taskId.localeCompare(a.taskId); // desempate estable
  });

  return { items, nextCursor: nextPageToken ?? null };
}
