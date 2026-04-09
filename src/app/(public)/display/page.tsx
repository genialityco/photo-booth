/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

const SCREENSAVER_VIDEO = "/screensaver.mp4";
// Segundos que se muestra el resultado antes de volver al screensaver
const DISPLAY_DURATION_MS = 15000;

type DisplayItem = {
  id: string;
  url?: string;
  videoUrl?: string;
};

export default function DisplayPage() {
  const [current, setCurrent] = useState<DisplayItem | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "imageTasks"),
      where("status", "==", "done"),
      orderBy("finishedAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;

      const doc = snap.docs[0];
      const item: DisplayItem = { id: doc.id, ...(doc.data() as any) };

      // Solo reaccionar si es un item nuevo
      if (item.id === lastIdRef.current) return;
      lastIdRef.current = item.id;

      // Cancelar timer anterior
      if (timerRef.current) clearTimeout(timerRef.current);

      // Fade in del nuevo item
      setVisible(false);
      setTimeout(() => {
        setCurrent(item);
        setVisible(true);
      }, 300);

      // Volver al screensaver después de DISPLAY_DURATION_MS
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setCurrent(null), 300);
      }, DISPLAY_DURATION_MS + 300);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const isVideo = !!current?.videoUrl;
  const mediaSrc = current?.videoUrl || current?.url;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Screensaver — visible cuando no hay item */}
      <video
        src={SCREENSAVER_VIDEO}
        autoPlay
        loop
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
          !current || !visible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Resultado — imagen o video */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
          current && visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {mediaSrc && (
          isVideo ? (
            <video
              key={mediaSrc}
              src={mediaSrc}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              key={mediaSrc}
              src={mediaSrc}
              alt="resultado"
              className="w-full h-full object-contain"
            />
          )
        )}
      </div>
    </div>
  );
}
