// src/app/api/qr/[id]/route.ts
import { NextResponse } from "next/server";
import { getQRStore } from "../_store";

export const dynamic = "force-dynamic"; // evita cacheos

export async function GET(req: Request) {
  // Obtener el id del pathname: /api/qr/<id>
  const { pathname } = new URL(req.url);
  const id = pathname.split("/").pop(); // último segmento

  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  const store = getQRStore();
  const item = store.get(id);

  if (!item || item.expiresAt < Date.now()) {
    return NextResponse.json(
      { error: "No encontrado o expirado" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    dataUrl: item.dataUrl,
    kind: item.kind,
  });
}
