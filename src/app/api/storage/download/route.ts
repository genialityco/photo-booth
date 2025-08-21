// app/api/storage/download/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
];

function getOrigin(req: NextRequest) {
  return req.headers.get("origin") ?? "";
}

function isAllowed(origin: string) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(origin: string) {
  const h = new Headers();
  if (isAllowed(origin)) h.set("Access-Control-Allow-Origin", origin);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  h.set("Access-Control-Max-Age", "3600");
  return h;
}

function sanitizeFileName(name: string) {
  return (name || "archivo").replace(/[^\w\s.-]/g, "_").slice(0, 150);
}

// Preflight
export async function OPTIONS(req: NextRequest) {
  const origin = getOrigin(req);
  const headers = corsHeaders(origin);
  return new Response(null, { status: 204, headers });
}

// GET /api/storage/download?url=...&filename=...
export async function GET(req: NextRequest) {
  const origin = getOrigin(req);

  if (!isAllowed(origin)) {
    return new Response("Origin not allowed", { status: 403, headers: corsHeaders(origin) });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const filename = sanitizeFileName(searchParams.get("filename") || "archivo");

  if (!url) {
    return new Response("Missing url", { status: 400, headers: corsHeaders(origin) });
  }

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => "");
    return new Response(`Upstream error ${upstream.status}: ${msg}`, {
      status: upstream.status,
      headers: corsHeaders(origin),
    });
  }

  const headers = corsHeaders(origin);
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  return new Response(upstream.body, { headers });
}
