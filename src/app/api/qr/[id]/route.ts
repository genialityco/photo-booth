// src/app/api/qr/[id]/route.ts
import { NextResponse } from "next/server";
import { getQRStore } from "../_store";
export const dynamic = "force-dynamic"; // evita cacheos

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const store = getQRStore();
  const item = store.get(params.id);
  if (!item || item.expiresAt < Date.now()) {
    return NextResponse.json({ error: "No encontrado o expirado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, dataUrl: item.dataUrl, kind: item.kind });
}
