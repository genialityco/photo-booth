// src/app/api/qr/[id]/route.ts
import { NextResponse } from "next/server";
import { getQRStore } from "../_store";

export const dynamic = "force-dynamic"; // evita cache

type RouteContext = {
  params: Record<string, string | string[]>;
};

export async function GET(_req: Request, context: RouteContext) {
  // Asegurar string (por si el runtime entrega string[])
  const idParam = context.params["id"];
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  const store = getQRStore();
  const item = store.get(id);

  if (!item || item.expiresAt < Date.now()) {
    return NextResponse.json({ error: "No encontrado o expirado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, dataUrl: item.dataUrl, kind: item.kind });
}
