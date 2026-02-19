/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";

/**
 * Genera un QR como dataURL usando un import dinámico de "qrcode"
 * npm i qrcode
 */
export default function QrTag({
  value,
  size = 1000,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const QR = await import("qrcode");
      const url = await QR.toDataURL(value, { width: size, margin: 1 });
      if (!cancel) setDataUrl(url);
    })();
    return () => {
      cancel = true;
    };
  }, [value, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size, aspectRatio: "1" }}>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={label || "QR code"}
            className="absolute inset-0 w-full h-full object-contain rounded-md border border-black/10"
          />
        ) : (
          <div className="w-full h-full rounded-md border border-black/10" />
        )}
      </div>
      {label && <span className="text-xs text-black/70">{label}</span>}
    </div>
  );
}
