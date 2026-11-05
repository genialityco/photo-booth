"use client";

import React, { useRef } from "react";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB por imagen, igual que ImageUploadField

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Lista de imágenes (data: URLs recién elegidas o URLs ya hospedadas). Se
 * pueden agregar varias de una vez y quitar de a una. La subida a Storage la
 * hace eventService al guardar el evento, igual que con ImageUploadField.
 */
export default function MultiImageUploadField({
  label,
  value,
  onChange,
  helperText,
  maxImages = 12,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  helperText?: string;
  maxImages?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const tooBig = files.filter((f) => f.size > MAX_SIZE);
    if (tooBig.length) {
      alert(`Estas imágenes superan 10MB y se omitieron: ${tooBig.map((f) => f.name).join(", ")}`);
    }
    const room = Math.max(0, maxImages - value.length);
    const accepted = files.filter((f) => f.size <= MAX_SIZE).slice(0, room);
    if (accepted.length < files.length - tooBig.length) {
      alert(`Máximo ${maxImages} imágenes.`);
    }

    try {
      const urls = await Promise.all(accepted.map(readAsDataURL));
      onChange([...value, ...urls]);
    } catch {
      alert("Error al leer alguno de los archivos. Intenta con otra imagen.");
    }
  };

  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {value.map((src, i) => (
          <div
            key={`${i}-${src.slice(-24)}`}
            className="relative aspect-square rounded-lg border border-gray-200 bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] flex items-center justify-center p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Logo ${i + 1}`} className="max-w-full max-h-full object-contain" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs leading-none hover:bg-red-700"
              aria-label={`Quitar logo ${i + 1}`}
              title="Quitar"
            >
              ×
            </button>
          </div>
        ))}
        {value.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-500 text-sm flex flex-col items-center justify-center"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="mt-1">Agregar</span>
          </button>
        )}
      </div>
      {helperText && <p className="text-xs text-gray-500 mt-1">{helperText}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        className="hidden"
      />
    </div>
  );
}
