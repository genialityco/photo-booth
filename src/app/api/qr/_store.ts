type QREntry = { dataUrl: string; kind: "raw" | "framed"; expiresAt: number };

export function getQRStore() {
  const g = globalThis as any;
  if (!g.__qrStore__) g.__qrStore__ = new Map<string, QREntry>();
  return g.__qrStore__ as Map<string, QREntry>;
}
