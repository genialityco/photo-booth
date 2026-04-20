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
  getDocs,
  doc,
  updateDoc
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import MosaicCanvas from "@/app/components/photo-booth/MosaicCanvas";

const SCREENSAVER_VIDEO = "/screensaver.mp4";
const DISPLAY_DURATION_MS = 15000;

type DisplayItem = { id: string; url?: string; videoUrl?: string };

function DisplayContent({ eventId, screenConfig }: { eventId: string, screenConfig: any }) {
  const [current, setCurrent] = useState<DisplayItem | null>(null);
  const [visible, setVisible] = useState(false);
  // Three states: "display" (normal), "mosaic_loading" (loading images, display still visible), "mosaic_showing" (mosaic active)
  const [mode, setMode] = useState<"display" | "mosaic_loading" | "mosaic_showing">("display");
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const mosaicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagesSinceMosaicRef = useRef<number>(0);
  const lastTriggerAtRef = useRef<number>(0);

  const handleMosaicReady = () => {
    // Only transition to showing if we were in loading state
    if (mode === "mosaic_loading") {
      setMode("mosaic_showing");
      const duration = (screenConfig?.mosaicDuration || 15) * 1000;
      if (mosaicTimerRef.current) clearTimeout(mosaicTimerRef.current);
      // Inicia el contador una vez cargado el mosaico
      mosaicTimerRef.current = setTimeout(() => {
        setMode("display");
        imagesSinceMosaicRef.current = 0;
      }, duration);
    }
  };

  // Manual Trigger via Firestore
  useEffect(() => {
    if (!screenConfig) return;
    const triggerAt = screenConfig.triggerMosaicAt;
    
    if (triggerAt && triggerAt > lastTriggerAtRef.current) {
      lastTriggerAtRef.current = triggerAt;
      setMode("mosaic_loading");
    }
  }, [screenConfig?.triggerMosaicAt]);

  // Image listener
  useEffect(() => {
    const constraints: Parameters<typeof query>[1][] = [
      where("status", "==", "done"),
      orderBy("finishedAt", "desc"),
      limit(1),
    ];
    if (eventId) constraints.push(where("eventId", "==", eventId));

    const q = query(collection(db, "imageTasks"), ...constraints);

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;
      const docSnap = snap.docs[0];
      const item: DisplayItem = { id: docSnap.id, ...(docSnap.data() as any) };
      if (item.id === lastIdRef.current) return;
      lastIdRef.current = item.id;
      
      // Auto trigger logic
      imagesSinceMosaicRef.current += 1;
      const autoEnabled = screenConfig?.mosaicAuto;
      const triggerCount = screenConfig?.mosaicTriggerCount || 10;
      
      if (autoEnabled && imagesSinceMosaicRef.current >= triggerCount && mode === "display") {
        // Start loading mosaic, but continue to show this image normally
        setMode("mosaic_loading");
      }

      if (mode === "mosaic_showing") return; // Si ya está mostrando el mosaico, ignorar

      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
      setTimeout(() => { setCurrent(item); setVisible(true); }, 300);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setCurrent(null), 300);
      }, DISPLAY_DURATION_MS + 300);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [eventId, mode, screenConfig?.mosaicAuto, screenConfig?.mosaicTriggerCount]);

  const isVideo = !!current?.videoUrl;
  const mediaSrc = current?.videoUrl || current?.url;

  return (
    <>
      {/* Mosaico por debajo, que carga en silencio */}
      {(mode === "mosaic_loading" || mode === "mosaic_showing") && (
        <div 
          className={`fixed inset-0 overflow-hidden transition-opacity duration-1000 ${
            mode === "mosaic_showing" ? "opacity-100 z-50" : "opacity-0 -z-10 pointer-events-none"
          }`} 
          style={{ background: "#0a0a0a" }}
        >
          <MosaicCanvas 
            eventId={eventId} 
            isShowing={mode === "mosaic_showing"} 
            onReady={handleMosaicReady} 
          />
        </div>
      )}

      {/* Pantalla normal de display */}
      <div 
        className={`fixed inset-0 bg-black overflow-hidden transition-opacity duration-1000 ${
          mode === "mosaic_showing" ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <video
          src={SCREENSAVER_VIDEO}
          autoPlay loop muted playsInline
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
            !current || !visible ? "opacity-100" : "opacity-0"
          }`}
        />
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
          current && visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}>
          {mediaSrc && (isVideo ? (
            <video key={mediaSrc} src={mediaSrc} autoPlay loop muted playsInline
              className="w-full h-full object-contain" />
          ) : (
            <img key={mediaSrc} src={mediaSrc} alt="resultado"
              className="w-full h-full object-contain" />
          ))}
        </div>
      </div>
    </>
  );
}

export default function DisplayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = React.use(params);
  const [eventId, setEventId] = useState<string | null>(null);
  const [screenConfig, setScreenConfig] = useState<any>(null);

  useEffect(() => {
    if (!slug) { setEventId(""); return; }
    
    // Instead of getDocs once, use onSnapshot to listen for screenConfig changes
    const q = query(collection(db, "events"), where("slug", "==", slug), where("isActive", "==", true));
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setEventId("");
      } else {
        const eventDoc = snap.docs[0];
        setEventId(eventDoc.id);
        setScreenConfig(eventDoc.data().screenConfig || {});
      }
    });
    
    return () => unsub();
  }, [slug]);

  if (eventId === null) return (
    <div className="fixed inset-0 bg-black" />
  );

  return <DisplayContent key={eventId} eventId={eventId} screenConfig={screenConfig} />;
}
