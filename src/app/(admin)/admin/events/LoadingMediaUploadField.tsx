"use client";

import React, { useRef, useState, useEffect } from "react";

/** Detecta si un data:URL o URL http es un video (webm) en vez de una imagen (gif). */
function isVideoSrc(src: string): boolean {
  if (src.startsWith("data:")) return src.startsWith("data:video/");
  return /\.webm(\?.*)?$/i.test(src);
}

export default function LoadingMediaUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronizar preview con value prop
  useEffect(() => {
    if (value && (value.startsWith("data:") || value.startsWith("http"))) {
      setPreview(value);
    } else if (!value) {
      setPreview(null);
    }
  }, [value]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type === "video/webm";
    const isGif = file.type === "image/gif";
    if (!isVideo && !isGif) {
      alert("Solo se aceptan archivos GIF o WEBM.");
      return;
    }

    // Un WEBM corto y comprimido entra bien en este límite; un GIF típico también.
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("El archivo es demasiado grande. El tamaño máximo es 25MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setPreview(result);
      onChange(result);
    };
    reader.onerror = () => {
      alert("Error al leer el archivo. Intenta con otro.");
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setPreview(null);
    onChange("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-gray-400 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        {preview ? (
          <div className="relative inline-block w-full">
            {isVideoSrc(preview) ? (
              <video src={preview} className="max-h-48 mx-auto rounded" muted loop autoPlay playsInline />
            ) : (
              <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded" />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="mt-2 w-full px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
            >
              Cambiar Archivo
            </button>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-600">Haz clic para seleccionar un GIF o WEBM</p>
            <p className="text-xs text-gray-500 mt-1">GIF, WEBM (máx 25MB)</p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/gif,video/webm"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
