// app/api/photos/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(), // o admin.credential.cert({...})
        storageBucket: "lenovo-experiences.appspot.com",
    });
}
const bucket = admin.storage().bucket();
const afs = admin.firestore();

function parseDataUrl(dataUrl: string) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
    if (!m) throw new Error("dataUrl inválido");
    const contentType = m[1];
    const buffer = Buffer.from(m[2], "base64");
    return { contentType, buffer };
}

export async function POST(req: NextRequest) {
    try {
        // Forma JSON: { rawDataUrl?, framedDataUrl?, qrId?, meta? }
        // (Si prefieres multipart, puedo pasarte variante; con JSON es más simple)
        const { rawDataUrl, framedDataUrl, qrId, meta } = await req.json();

        // Generar nombres
        const now = Date.now();
        const id = `${now}-${Math.random().toString(36).slice(2)}`;
        const paths: { raw?: string; framed?: string } = {};
        const urls: { raw?: string; framed?: string } = {};

        if (!rawDataUrl && !framedDataUrl) {
            return NextResponse.json({ error: "Falta rawDataUrl o framedDataUrl" }, { status: 400 });
        }

        // Subir RAW
        if (rawDataUrl) {
            const { buffer, contentType } = parseDataUrl(rawDataUrl);
            const path = `survey-submissions/${id}-raw.png`;
            const f = bucket.file(path);
            await f.save(buffer, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
            await f.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(path)}`;
            paths.raw = path;
            urls.raw = url;
        }

        // Subir FRAMED
        if (framedDataUrl) {
            const { buffer, contentType } = parseDataUrl(framedDataUrl);
            const path = `survey-submissions/${id}-framed.png`;
            const f = bucket.file(path);
            await f.save(buffer, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
            await f.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(path)}`;
            paths.framed = path;
            urls.framed = url;
        }

        // Crear documento en Firestore
        const docRef = await afs.collection("surveys").add({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            qrId: qrId ?? null,
            ...((meta && typeof meta === "object") ? meta : {}),
            photoRawPath: paths.raw ?? null,
            photoRawUrl: urls.raw ?? null,
            photoFramedPath: paths.framed ?? null,
            photoFramedUrl: urls.framed ?? null,
        });

        return NextResponse.json({
            docId: docRef.id,
            rawUrl: urls.raw || null,
            framedUrl: urls.framed || null,
        });
    } catch (e: unknown) {
        console.error(e);
        const errorMsg = e instanceof Error ? e.message : "Upload failed";
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
