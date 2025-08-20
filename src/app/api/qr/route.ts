import { NextResponse } from "next/server";
import { getQRStore } from "./_store";

const TTL_MINUTES = 30;
const makeId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function POST(req: Request) {
    try {
        const { rawPhoto, framedPhoto } = await req.json();
        if (!rawPhoto && !framedPhoto)
            return NextResponse.json({ error: "Falta rawPhoto o framedPhoto" }, { status: 400 });

        const store = getQRStore();
        const origin = new URL(req.url).origin;
        const exp = Date.now() + TTL_MINUTES * 60_000;

        const result: Record<string, string> = {};
        if (framedPhoto) {
            const id = makeId();
            store.set(id, { dataUrl: framedPhoto, kind: "framed", expiresAt: exp });
            result.framedUrl = `${origin}/survey?qrId=${id}&kind=framed`;
        }
        if (rawPhoto) {
            const id = makeId();
            store.set(id, { dataUrl: rawPhoto, kind: "raw", expiresAt: exp });
            result.rawUrl = `${origin}/survey?qrId=${id}&kind=raw`;
        }

        // Limpieza simple
        for (const [k, v] of store) if (v.expiresAt < Date.now()) store.delete(k);

        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }
}
