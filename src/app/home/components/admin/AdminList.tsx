/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getStorage, ref as storageRef, listAll, getDownloadURL } from "firebase/storage";

/* ================== Tipos ================== */
type TaskItem = {
  id: string;
  status?: "queued" | "processing" | "done" | "error";
  nombre: string;
  inputPath?: string;   // ahora apunta a la foto con marco (input.png)
  framedPath?: string;  // igual a inputPath
  framedUrl?: string;   // URL pública de la foto con marco
  outputPath?: string;  // output.png (IA)
  url?: string;         // URL pública de la IA
  createdAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
  finishedAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
};

/* ================== Helpers de fecha/descarga ================== */
function toDate(v: TaskItem["createdAt"]) {
  if (!v) return null;
  try {
    return "toDate" in v ? v.toDate() : new Date((v.seconds || 0) * 1000);
  } catch {
    return null;
  }
}

async function downloadAs(filename: string, url: string) {
  try {
    // Cargar imagen original
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo descargar la imagen base.");
    const blob = await res.blob();
    const baseImage = await createImageBitmap(blob);

    // Cargar el marco
    const frameUrl = "/Colombia4.0/MARCO_IA_4.0.png";
    const frameRes = await fetch(frameUrl, { cache: "no-store" });
    if (!frameRes.ok) throw new Error("No se pudo cargar el marco.");
    const frameBlob = await frameRes.blob();
    const frameImage = await createImageBitmap(frameBlob);

    // Crear canvas con tamaño del marco
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const size = 1024;
    canvas.width = size;
    canvas.height = size;

    if (!ctx) throw new Error("No se pudo obtener el contexto del canvas.");

    // Dibujar fondo transparente
    ctx.clearRect(0, 0, size, size);

    // Calcular área interna (con padding)
    const paddingTop = 10;
    const paddingSides = 10;
    const paddingBottom = 30;
    const innerWidth = size - paddingSides * 2;
    const innerHeight = size - (paddingTop + paddingBottom);

    // Escalar la imagen base para que encaje en el área interna
    const aspectBase = baseImage.width / baseImage.height;
    let drawWidth = innerWidth;
    let drawHeight = drawWidth / aspectBase;
    if (drawHeight > innerHeight) {
      drawHeight = innerHeight;
      drawWidth = drawHeight * aspectBase;
    }

    // Centrar dentro del área interior
    const x = paddingSides + (innerWidth - drawWidth) / 2;
    const y = paddingTop + (innerHeight - drawHeight) / 2;

    // Dibujar imagen base
    ctx.drawImage(baseImage, x, y, drawWidth, drawHeight);

    // Dibujar marco encima
    ctx.drawImage(frameImage, 0, 0, size, size);

    // Descargar resultado final
    const finalBlob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png")
    );

    const blobUrl = URL.createObjectURL(finalBlob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    console.log("✅ Imagen con marco descargada correctamente.");
  } catch (err) {
    console.error("❌ Error al generar la imagen con marco:", err);
  }
}

/* ================== Helpers de paths ================== */
// Extrae "path" de una URL https de Firebase Storage
function pathFromStorageUrl(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

// De "tasks/abc/input.png" -> "tasks/abc"
function getFolderFromPath(p?: string | null) {
  if (!p) return null;
  const m = p.match(/^(.*)\/[^/]+$/);
  return m ? m[1] : null;
}

// Resuelve la carpeta raíz de una tarea desde sus campos
function resolveFolderFromTask(it: TaskItem): string | null {
  const fromPath =
    getFolderFromPath(it.framedPath) ??
    getFolderFromPath(it.inputPath) ??
    getFolderFromPath(it.outputPath);
  if (fromPath) return fromPath;

  const fromHttps = pathFromStorageUrl(it.url);
  if (fromHttps) return getFolderFromPath(fromHttps);

  const fromFramedHttps = pathFromStorageUrl(it.framedUrl);
  if (fromFramedHttps) return getFolderFromPath(fromFramedHttps);

  return null;
}

/* ================== Hook: resolver URL de foto con marco ================== */
function useFramedURL(it: { framedUrl?: string; framedPath?: string; inputPath?: string }) {
  const [url, setUrl] = useState<string | null>(it.framedUrl || null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (it.framedUrl) {
        setUrl(it.framedUrl);
        return;
      }
      const path = it.framedPath || it.inputPath;
      if (!path) return;
      try {
        const storage = getStorage();
        const u = await getDownloadURL(storageRef(storage, path));
        if (!cancel) setUrl(u);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [it.framedUrl, it.framedPath, it.inputPath]);

  return url;
}

/* ================== Card por ítem ================== */
function AdminItemCard({ it }: { it: TaskItem }) {
  const framedResolvedUrl = useFramedURL({
    framedUrl: it.framedUrl,
    framedPath: it.framedPath,
    inputPath: it.inputPath,
  });

  const created = toDate(it.createdAt);
  const updated = toDate(it.updatedAt);
  const finished = toDate(it.finishedAt);
  const createdStr = created ? created.toLocaleString() : "—";
  const updatedStr = updated ? updated.toLocaleString() : "—";
  const finishedStr = finished ? finished.toLocaleString() : "—";

  return (
    <article className="rounded-xl border border-neutral-200 p-4 flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2 justify-between">
        <div className="font-bold text-lg">
          <code className="font-mono">{it.id}</code>
        </div>
        <div className="text-sm">
          <span
            className={[
              "inline-flex items-center px-2 py-0.5 rounded-full font-semibold",
              it.status === "done"
                ? "bg-emerald-100 text-emerald-800"
                : it.status === "processing"
                ? "bg-amber-100 text-amber-800"
                : it.status === "error"
                ? "bg-red-100 text-red-800"
                : "bg-neutral-100 text-neutral-800",
            ].join(" ")}
          >
            {it.status || "queued"}
          </span>
        </div>
      </header>

      <dl className="text-sm grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <dt className="text-neutral-500">Creado</dt>
          <dd>{createdStr}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Actualizado</dt>
          <dd>{updatedStr}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Finalizado</dt>
          <dd>{finishedStr}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CON MARCO */}
        <div className="rounded-lg border border-neutral-200 p-3">
          <h3 className="font-semibold mb-2">Foto con marco</h3>
          {framedResolvedUrl ? (
            <>
              <div className="aspect-square w-full overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <img src={framedResolvedUrl} alt="framed" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <a
                  href={framedResolvedUrl}
                  target="_blank"
                  className="px-3 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold"
                >
                  Abrir
                </a>
                <button
                  className="px-3 py-2 rounded-lg bg-neutral-200 text-neutral-900 text-sm font-semibold"
                  onClick={() => downloadAs(`framed-${it.id}.png`, framedResolvedUrl)}
                >
                  Descargar
                </button>
                <code className="text-xs break-all">{it.framedPath || it.inputPath || "—"}</code>
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-500">No disponible.</p>
          )}
        </div>

        {/* IA */}
        <div className="rounded-lg border border-neutral-200 p-3">
          <h3 className="font-semibold mb-2">Imagen IA (Function)</h3>
          {it.url ? (
            <>
              <div className="aspect-square w-full overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <img src={it.url} alt="ai" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <a
                  href={it.url}
                  target="_blank"
                  className="px-3 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold"
                >
                  Abrir
                </a>
                <button
                  className="px-3 py-2 rounded-lg bg-neutral-200 text-neutral-900 text-sm font-semibold"
                  onClick={() => downloadAs(`ai-${it.id}.png`, it.url!)}
                >
                  Descargar
                </button>
                <code className="text-xs break-all">{it.outputPath || "—"}</code>
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-500">Aún no procesada o no hay URL.</p>
          )}
        </div>
      </div>
    </article>
  );
}

/* ================== Componente principal ================== */
export default function AdminList() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;
  const unsubRef = useRef<undefined | (() => void)>(undefined);

  const baseCol = useMemo(() => collection(db, "imageTasks"), []);

  // Cargar todos los datos (sin límite) en tiempo real
  useEffect(() => {
    setLoading(true);
    const q = query(baseCol, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: TaskItem[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        setItems(arr);
        setLoading(false);
      },
      () => setLoading(false)
    );
    unsubRef.current = unsub;
    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = undefined;
    };
  }, [baseCol]);

  // Filtrar solo los que están "done"
  const filtered = items.filter((it) => it.status === "done");
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  /* ============ Descargar TODO en un solo ZIP (todas o solo página) ============ */
  const [downloadingAll, setDownloadingAll] = useState(false);

  async function handleDownloadAllAsOneZip(allPages = true) {
    try {
      setDownloadingAll(true);

      const source = allPages ? filtered : paginated;
      if (!source.length) return;

      // Carga dinámica de JSZip
      const JSZipMod = await import("jszip");
      const JSZip = JSZipMod.default ?? (JSZipMod as any);
      const zip = new JSZip();

      const storage = getStorage();

      // Recorre recursivamente una carpeta
      async function collectFilesRecursively(folderPath: string) {
        const baseRef = storageRef(storage, folderPath);

        async function walk(dirRef: any): Promise<any[]> {
          const out: any[] = [];
          const res = await listAll(dirRef);
          out.push(...res.items); // archivos en este nivel
          for (const p of res.prefixes) {
            const kids = await walk(p); // subcarpetas
            out.push(...kids);
          }
          return out;
        }

        return walk(baseRef);
      }

      // Normaliza "gs://bucket/..." a ruta relativa y quita leading slash
      const normalizeBase = (folder: string) =>
        folder.replace(/^gs:\/\/[^/]+\/?/, "").replace(/^\/+/, "");

      // Por cada tarea -> agrega sus archivos como subcarpeta <taskId>/...
      for (const it of source) {
        const folder = resolveFolderFromTask(it);
        if (!folder) continue;

        const files = await collectFilesRecursively(folder);
        if (!files.length) continue;

        const basePrefix = normalizeBase(folder);
        const taskRoot = zip.folder(it.id)!;

        // Descarga concurrente moderada
        const CONCURRENCY = 4;
        let idx = 0;

        async function worker() {
          while (idx < files.length) {
            const k = idx++;
            const fileRef = files[k];
            const url = await getDownloadURL(fileRef);
            const resp = await fetch(url, { cache: "no-store" });
            if (!resp.ok) throw new Error(`Error al descargar ${fileRef.fullPath}`);
            const blob = await resp.blob();

            const fullPath = fileRef.fullPath;
            const relative = fullPath.startsWith(basePrefix)
              ? fullPath.slice(basePrefix.length).replace(/^\/+/, "")
              : fileRef.name;

            taskRoot.file(relative, blob); // Guarda dentro de /<taskId>/
          }
        }

        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      }

      // Generar y descargar ZIP único
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zipBlob);
      a.download = allPages ? "AllPhotos.zip" : `Photos-${page}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloadingAll(false);
    }
  }

  return (
    <section className="w-full">
      {/* Barra de acciones */}
      <div className="flex flex-wrap gap-2 items-center justify-end">
        <button
          onClick={() => handleDownloadAllAsOneZip(true)}
          disabled={downloadingAll || loading || filtered.length === 0}
          className="px-3 py-2 rounded-lg bg-neutral-900 text-white font-semibold disabled:opacity-50"
        >
          {downloadingAll ? "Empaquetando…" : "Descargar TODAS LAS FOTOS"}
        </button>
        <button
          onClick={() => handleDownloadAllAsOneZip(false)}
          disabled={downloadingAll || loading || paginated.length === 0}
          className="px-3 py-2 rounded-lg bg-neutral-200 text-neutral-900 font-semibold disabled:opacity-50"
        >
          {downloadingAll ? "Empaquetando…" : "Descargar esta página "}
        </button>
      </div>

      {/* Cards */}
      <div className="mt-5 grid grid-cols-1 gap-4">
        {loading && (
          <div className="rounded-xl border border-neutral-200 p-4">Cargando…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-neutral-200 p-4">Sin resultados.</div>
        )}

        {paginated.map((it) => (
          <AdminItemCard key={it.id} it={it} />
        ))}
      </div>

      {/* Paginador */}
      {!loading && totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={handlePrev}
            disabled={page === 1}
            className="px-3 py-2 rounded-lg bg-neutral-200 text-neutral-900 font-semibold disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="font-bold">Página {page} de {totalPages}</span>
          <button
            onClick={handleNext}
            disabled={page === totalPages}
            className="px-3 py-2 rounded-lg bg-neutral-200 text-neutral-900 font-semibold disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}