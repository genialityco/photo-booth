"use client";

import React, { useRef, useState, useEffect } from "react";
import { isVideoMediaSrc as isVideoSrc } from "@/app/components/photo-booth/loadingMedia";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTask,
} from "firebase/storage";
import { app } from "@/firebaseConfig";

// MP4 además de WEBM: Safari en iPad (las tablets del booth) no siempre
// reproduce WEBM, y MP4 (H.264) anda en todos lados.
const ACCEPTED_TYPES = ["image/gif", "video/webm", "video/mp4"];

export default function LoadingMediaUploadField({
  label,
  value,
  onChange,
  eventSlug,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  eventSlug: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTaskRef = useRef<UploadTask | null>(null);

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

    if (!ACCEPTED_TYPES.includes(file.type)) {
      alert("Solo se aceptan archivos GIF, MP4 o WEBM.");
      return;
    }

    // Un video corto y comprimido entra bien en este límite; un GIF típico también.
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("El archivo es demasiado grande. El tamaño máximo es 25MB.");
      return;
    }

    uploadTaskRef.current?.cancel();
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const safeSlug = eventSlug.trim().replace(/[^a-z0-9_-]/gi, "_") || "event";
    const storageRef = ref(
      getStorage(app),
      `events/${safeSlug}/loadingMedia-${Date.now()}.${extension}`
    );

    setUploading(true);
    setUploadError(null);
    setPreview(URL.createObjectURL(file));

    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "application/octet-stream",
    });
    uploadTaskRef.current = uploadTask;
    uploadTask.on(
      "state_changed",
      undefined,
      (error) => {
        console.error("Error uploading loading media:", error);
        uploadTaskRef.current = null;
        setUploading(false);
        setUploadError("No se pudo subir el archivo. Intenta nuevamente.");
        setPreview(null);
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          uploadTaskRef.current = null;
          onChange(url);
          setUploading(false);
        } catch (error) {
          console.error("Error getting loading media URL:", error);
          uploadTaskRef.current = null;
          setUploading(false);
          setUploadError("El archivo se subió, pero no se pudo obtener su URL.");
          setPreview(null);
        }
      }
    );
  };

  const handleClear = () => {
    uploadTaskRef.current?.cancel();
    uploadTaskRef.current = null;
    setUploading(false);
    setPreview(null);
    setUploadError(null);
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
            {uploading && (
              <p className="mt-2 text-center text-sm text-blue-700">Subiendo archivo...</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="flex-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
              >
                Cambiar Archivo
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="flex-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
              >
                Quitar
              </button>
            </div>
            {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-600">Haz clic para seleccionar un video o GIF</p>
            <p className="text-xs text-gray-500 mt-1">MP4, WEBM o GIF (máx 25MB, se reproduce en loop)</p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
