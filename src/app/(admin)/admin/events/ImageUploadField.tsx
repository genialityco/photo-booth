"use client";

import React, { useRef, useState, useEffect } from "react";

export default function ImageUploadField({
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

    // Validar tamaño (máx 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert("La imagen es demasiado grande. El tamaño máximo es 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      
      // Verificar que el resultado no sea demasiado grande
      if (result.length > 15 * 1024 * 1024) { // ~15MB en base64
        alert("La imagen codificada es demasiado grande. Intenta con una imagen más pequeña.");
        return;
      }
      
      setPreview(result);
      onChange(result);
    };
    reader.onerror = () => {
      alert("Error al leer el archivo. Intenta con otra imagen.");
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
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-gray-400 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        {preview ? (
          <div className="relative inline-block w-full">
            <img
              src={preview}
              alt="Preview"
              className="max-h-48 mx-auto rounded"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="mt-2 w-full px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
            >
              Cambiar Imagen
            </button>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-600">Haz clic para seleccionar una imagen</p>
            <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF (máx 10MB)</p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
