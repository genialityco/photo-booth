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
import { getStorage, ref, getDownloadURL } from "firebase/storage";

type TaskItem = {
  id: string;
  status?: "queued" | "processing" | "done" | "error";
  inputPath?: string;   // ahora apunta a la foto con marco (input.png)
  framedPath?: string;  // igual a inputPath
  framedUrl?: string;   // URL pública de la foto con marco
  outputPath?: string;  // output.png (IA)
  url?: string;         // URL pública de la IA
  createdAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
  finishedAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
};

function toDate(v: TaskItem["createdAt"]) {
  if (!v) return null;
  try {
    // Firestore Timestamp o POJO similar
    return "toDate" in v ? v.toDate() : new Date((v.seconds || 0) * 1000);
  } catch {
    return null;
  }
}

async function downloadAs(filename: string, url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo descargar el archivo.");
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

/** Hook: resuelve URL de foto con marco usando framedUrl o (fallback) framedPath/inputPath */
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
        const u = await getDownloadURL(ref(storage, path));
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

/** Componente hijo por ítem: aquí SÍ podemos usar hooks sin error */
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
          taskId: <code className="font-mono">{it.id}</code>
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

export default function AdminList() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [qId, setQId] = useState("");
  const unsubRef = useRef<undefined | (() => void)>(undefined);

  const baseCol = useMemo(() => collection(db, "imageTasks"), []);

  // carga inicial: últimas 50 (más recientes primero)
  useEffect(() => {
    setLoading(true);
    const q = query(baseCol, orderBy("createdAt", "desc"), limit(50));
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qId.trim()) return;

    // corta suscripción actual de “últimas 50”
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = undefined;
    }

    setLoading(true);
    try {
      const q = query(baseCol, where("__name__", "==", qId.trim()));
      const s = await getDocs(q);
      const arr: TaskItem[] = [];
      s.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setItems(arr);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    // re-suscribir a últimas 50
    setQId("");
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = undefined;
    }
    setLoading(true);
    const q = query(baseCol, orderBy("createdAt", "desc"), limit(50));
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
  };

  return (
    <section className="w-full">
      {/* Buscador por taskId */}
      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-neutral-600">Buscar por taskId</label>
          <input
            value={qId}
            onChange={(e) => setQId(e.target.value)}
            placeholder="t_abcd1234_xxxx"
            className="mt-1 px-3 py-2 rounded-lg border border-neutral-300 w-[min(80vw,28rem)]"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold disabled:opacity-60"
          disabled={!qId.trim()}
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 rounded-lg bg-neutral-200 text-neutral-900 font-semibold"
        >
          Últimas 50
        </button>
      </form>

      {/* Cards */}
      <div className="mt-5 grid grid-cols-1 gap-4">
        {loading && (
          <div className="rounded-xl border border-neutral-200 p-4">Cargando…</div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-neutral-200 p-4">Sin resultados.</div>
        )}

        {items.map((it) => (
          <AdminItemCard key={it.id} it={it} />
        ))}
      </div>
    </section>
  );
}
