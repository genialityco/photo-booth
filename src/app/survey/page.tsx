// app/survey/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createSurveyRecord } from "../services/surveyServices";

type QRResponse =
    | { ok: true; dataUrl: string; kind: "raw" | "framed" }
    | { error: string };

export default function SurveyPage() {
    const sp = useSearchParams();
    const router = useRouter();

    const qrId = sp.get("qrId");
    const kind = (sp.get("kind") as "raw" | "framed") || undefined;

    const [photo, setPhoto] = useState<string>("");
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

    // Carga la foto asociada al qrId (SIN Firebase, desde tu API efímera)
    useEffect(() => {
        let abort = false;
        (async () => {
            try {
                if (!qrId) throw new Error("Falta 'qrId' en la URL.");
                const res = await fetch(`/api/qr/${qrId}`);
                if (!res.ok) throw new Error("QR inválido o expirado.");
                const data = (await res.json()) as QRResponse;
                if ("error" in data) throw new Error(data.error);
                if (!abort) setPhoto(data.dataUrl);
            } catch (e: any) {
                if (!abort) setErr(e.message || "No se pudo cargar la foto.");
            } finally {
                if (!abort) setLoadingPhoto(false);
            }
        })();
        return () => {
            abort = true;
        };
    }, [qrId]);

    const handleChange =
        (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
            setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!qrId || !photo) {
            setErr("No hay foto asociada al QR.");
            return;
        }
        setSending(true);
        setErr("");
        try {
            await createSurveyRecord({
                qrId,
                kind,
                photoDataUrl: photo,
                nombre: form.nombre.trim(),
                telefono: form.telefono.trim(),
                correo: form.correo.trim(),
                cargo: form.cargo.trim(),
                empresa: form.empresa.trim(),
            });
            setOk(true);
            setTimeout(() => router.replace("/"), 2000);
        } catch (e: any) {
            setErr(e.message || "No se pudo guardar la encuesta.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center gap-6 p-4">
            <h1 className="text-2xl md:text-3xl font-bold">Encuesta</h1>

            {/* Estado de foto */}
            {loadingPhoto && <p className="text-sm text-white/80">Cargando foto…</p>}
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
                        alt="Foto seleccionada desde el QR"
                        className="w-full h-auto object-contain rounded-lg"
                    />
                </div>
            )}

            {/* Formulario */}
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-xl grid grid-cols-1 gap-3"
            >
                <label className="text-sm">Nombre</label>
                <input
                    required
                    placeholder="Tu nombre"
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.nombre}
                    onChange={handleChange("nombre")}
                />

                <label className="text-sm">Teléfono</label>
                <input
                    required
                    placeholder="Ej. 3001234567"
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.telefono}
                    onChange={handleChange("telefono")}
                    type="tel"
                    inputMode="tel"
                />

                <label className="text-sm">Correo</label>
                <input
                    required
                    placeholder="tucorreo@ejemplo.com"
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.correo}
                    onChange={handleChange("correo")}
                    type="email"
                    inputMode="email"
                />

                <label className="text-sm">Cargo</label>
                <input
                    required
                    placeholder="Tu cargo"
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.cargo}
                    onChange={handleChange("cargo")}
                />

                <label className="text-sm">Empresa</label>
                <input
                    required
                    placeholder="Nombre de la empresa"
                    className="px-3 py-2 rounded-lg bg-white/90 text-black"
                    value={form.empresa}
                    onChange={handleChange("empresa")}
                />

                <button
                    type="submit"
                    disabled={sending || !photo}
                    className="mt-2 px-4 py-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                >
                    {sending ? "Guardando..." : "Enviar respuesta"}
                </button>

                {ok && (
                    <p className="text-emerald-400">
                        ¡Gracias! Tu registro fue guardado.
                    </p>
                )}
            </form>
        </div>
    );
}
