// app/survey/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createSurveyRecord } from "../services/surveyServices";

type QRResponse =
    | { ok: true; dataUrl: string; kind: "raw" | "framed" }
    | { error: string };

async function httpUrlToDataUrl(url: string): Promise<string> {
    const res = await fetch(url, { cache: "no-store" });
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
}

export default function SurveyPage() {
    const sp = useSearchParams();
    const router = useRouter();

    const src = sp.get("src");                 // URL http(s) directa de la imagen (opcional)
    const qrId = sp.get("qrId");               // id efímero (si usas /api/qr) (opcional)
    const kind = (sp.get("kind") as "raw" | "framed") || undefined;
    const filenameFromQS = sp.get("filename") || undefined;

    const [photo, setPhoto] = useState<string>("");   // imagen mostrada (http o dataURL)
    const [loadingPhoto, setLoadingPhoto] = useState(true);
    const [err, setErr] = useState<string>("");

    const [form, setForm] = useState({
        nombre: "",
        telefono: "",
        correo: "",
        cargo: "",
        empresa: "",
    });

    const [sending, setSending] = useState(false);
    const [ok, setOk] = useState(false);

    const suggestedName = useMemo(() => {
        if (filenameFromQS) return filenameFromQS;
        const base = kind === "framed" ? "foto-con-marco" : "foto-sin-marco";
        const t = new Date().toISOString().replace(/[:.]/g, "-");
        return `${base}-${t}.png`;
    }, [filenameFromQS, kind]);

    // 1) Cargar imagen real: preferimos ?src=...; si no, usamos ?qrId=...
    useEffect(() => {
        let abort = false;
        (async () => {
            try {
                if (src) {
                    // src debe ser http(s) o /ruta — no cargamos dataURL largo por QR
                    const absolute =
                        src.startsWith("/") && typeof window !== "undefined"
                            ? `${window.location.origin}${src}`
                            : src;
                    if (!abort) setPhoto(absolute);
                    return;
                }
                if (qrId) {
                    console.log("qr id", qrId);
                    
                    const res = await fetch(`/api/qr/${qrId}`, { cache: "no-store" });
                    console.log("res qr", res);
                    
                    if (!res.ok) throw new Error("QR inválido o expirado.");
                    const data = (await res.json()) as QRResponse;
                    if ("error" in data) throw new Error(data.error);
                    if (!abort) setPhoto(data.dataUrl); // dataURL desde el store efímero
                    return;
                }
                throw new Error("No se encontró 'src' ni 'qrId' en la URL.");
            } catch (e: any) {
                if (!abort) setErr(e.message || "No se pudo cargar la imagen.");
            } finally {
                if (!abort) setLoadingPhoto(false);
            }
        })();
        return () => {
            abort = true;
        };
    }, [src, qrId]);

    const handleChange =
        (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
            setForm((f) => ({ ...f, [key]: e.target.value }));

    // 2) Guardar en Firestore/Storage: si photo es http → convertir a dataURL; si ya es dataURL → directo
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!photo) {
            setErr("No hay imagen para guardar.");
            return;
        }
        setSending(true);
        setErr("");
        try {
            const isHttp = photo.startsWith("http://") || photo.startsWith("https://");
            const dataUrl = isHttp ? await httpUrlToDataUrl(photo) : photo;

            await createSurveyRecord({
                qrId: qrId ?? (src ? "from-src" : "unknown"),
                kind,
                photoDataUrl: dataUrl, // guardamos EXACTAMENTE lo que se muestra
                nombre: form.nombre.trim(),
                telefono: form.telefono.trim(),
                correo: form.correo.trim(),
                cargo: form.cargo.trim(),
                empresa: form.empresa.trim(),
            });

            setOk(true);
            setTimeout(() => router.replace("/camera"), 1800);
        } catch (e: any) {
            setErr(e.message || "No se pudo guardar la encuesta.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center gap-6 p-4">
            <h1 className="text-2xl md:text-3xl font-bold">Encuesta</h1>

            {loadingPhoto && <p className="text-sm text-white/80">Cargando imagen…</p>}
            {err && (
                <div className="max-w-xl w-full p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
                    {err}
                    <div className="mt-2">
                        <button
                            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                            onClick={() => router.replace("/")}
                        >
                            Volver al inicio
                        </button>
                    </div>
                </div>
            )}

            {photo && (
                <div className="w-full max-w-xl bg-white/5 rounded-xl p-3 border border-white/10">
                    <img
                        src={photo}
                        alt="Imagen a guardar/descargar"
                        className="w-full h-auto object-contain rounded-lg"
                    />
                    <div className="flex justify-end mt-2">
                        <a
                            href={photo}
                            download={suggestedName}
                            className="px-3 py-1 rounded-lg text-sm bg-white/90 text-black hover:bg-white"
                        >
                            Descargar esta imagen
                        </a>
                    </div>
                </div>
            )}

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="w-full max-w-xl grid grid-cols-1 gap-3">
                <label className="text-sm">Nombre</label>
                <input
                    required
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.nombre}
                    onChange={handleChange("nombre")}
                    placeholder="Tu nombre"
                />

                <label className="text-sm">Teléfono</label>
                <input
                    required
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.telefono}
                    onChange={handleChange("telefono")}
                    type="tel"
                    inputMode="tel"
                    placeholder="Ej. 3001234567"
                />

                <label className="text-sm">Correo</label>
                <input
                    required
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.correo}
                    onChange={handleChange("correo")}
                    type="email"
                    inputMode="email"
                    placeholder="tucorreo@ejemplo.com"
                />

                <label className="text-sm">Cargo</label>
                <input
                    required
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.cargo}
                    onChange={handleChange("cargo")}
                    placeholder="Tu cargo"
                />

                <label className="text-sm">Empresa</label>
                <input
                    required
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.empresa}
                    onChange={handleChange("empresa")}
                    placeholder="Nombre de la empresa"
                />

                <button
                    type="submit"
                    disabled={sending || !photo}
                    className="mt-2 px-4 py-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                >
                    {sending ? "Guardando..." : "Enviar respuesta"}
                </button>

                {ok && <p className="text-emerald-400">¡Gracias! Registro guardado.</p>}
            </form>
        </div>
    );
}
