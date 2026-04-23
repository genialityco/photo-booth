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
  const lastTriggerAtRef = useRef<number>(0);
  const isInitialConfigRef = useRef<boolean>(true);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const isDisplayingImageRef = useRef(false);
  const pendingMosaicRef = useRef(false);

  const triggerMosaicShow = React.useCallback(() => {
    setMode((prevMode) => {
      if (prevMode === "mosaic_loading") {
        const duration = (screenConfig?.mosaicDuration || 15) * 1000;
        if (mosaicTimerRef.current) clearTimeout(mosaicTimerRef.current);
        mosaicTimerRef.current = setTimeout(() => {
          setMode("display");
          setCurrent(null);
          setVisible(false);
        }, duration);
        return "mosaic_showing";
      }
      return prevMode;
    });
    pendingMosaicRef.current = false;
  }, [screenConfig?.mosaicDuration]);

  const handleMosaicReady = React.useCallback(() => {
    if (isDisplayingImageRef.current) {
      pendingMosaicRef.current = true;
    } else {
      triggerMosaicShow();
    }
  }, [triggerMosaicShow]);

  // Manual Trigger via Firestore
  useEffect(() => {
    if (!screenConfig) return;
    const triggerAt = screenConfig.triggerMosaicAt;
    
    if (isInitialConfigRef.current) {
      isInitialConfigRef.current = false;
      lastTriggerAtRef.current = triggerAt || 0;
      return;
    }
    
    if (triggerAt && triggerAt > lastTriggerAtRef.current) {
      lastTriggerAtRef.current = triggerAt;
      setMode("mosaic_loading");
    }
  }, [screenConfig?.triggerMosaicAt]);

  const isInitialSnapshotRef = useRef<boolean>(true);

  // Image listener
  useEffect(() => {
    isInitialSnapshotRef.current = true;
    const constraints: Parameters<typeof query>[1][] = [
      where("status", "==", "done"),
      orderBy("finishedAt", "desc"),
    ];
    if (eventId) constraints.push(where("eventId", "==", eventId));

    const q = query(collection(db, "imageTasks"), ...constraints);

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;
      const docSnap = snap.docs[0];
      const item: DisplayItem = { id: docSnap.id, ...(docSnap.data() as any) };
      const totalImages = snap.size;
      
      const isInitial = isInitialSnapshotRef.current;
      isInitialSnapshotRef.current = false;

      if (item.id === lastIdRef.current) return;
      lastIdRef.current = item.id;
      
      if (modeRef.current === "mosaic_showing") return; // Si ya está mostrando el mosaico, ignorar

      isDisplayingImageRef.current = true;
      
      // Auto trigger logic based on total image count
      const autoEnabled = screenConfig?.mosaicAuto;
      const triggerCount = Number(screenConfig?.mosaicTriggerCount) || 10;
      
      console.log(`[Mosaic Trigger Check] Image received: ${item.id}`);
      console.log(`- isInitial: ${isInitial}`);
      console.log(`- totalImages: ${totalImages}`);
      console.log(`- autoEnabled: ${autoEnabled}`);
      console.log(`- triggerCount: ${triggerCount}`);
      console.log(`- modeRef.current: ${modeRef.current}`);
      console.log(`- Math: ${totalImages} % ${triggerCount} = ${totalImages % triggerCount}`);

      if (!isInitial && autoEnabled && triggerCount > 0 && totalImages % triggerCount === 0 && modeRef.current === "display") {
        console.log(`[Mosaic Trigger] CONDITION MET! Launching mosaic_loading`);
        setMode("mosaic_loading");
      } else {
        console.log(`[Mosaic Trigger] Condition not met.`);
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
      setTimeout(() => { setCurrent(item); setVisible(true); }, 300);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => {
          setCurrent(null);
          isDisplayingImageRef.current = false;
          if (pendingMosaicRef.current) {
            triggerMosaicShow();
          }
        }, 300);
      }, DISPLAY_DURATION_MS + 300);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [eventId, screenConfig?.mosaicAuto, screenConfig?.mosaicTriggerCount, triggerMosaicShow]);

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
            imageMultiplier={screenConfig?.mosaicImageMultiplier || 1}
            animationType={screenConfig?.mosaicAnimation || "fall"}
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
          className={`absolute inset-0 w-full h-full object-fill transition-opacity duration-500 ${
            !current || !visible ? "opacity-100" : "opacity-0"
          }`}
        />
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
          current && visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}>
          {mediaSrc && (isVideo ? (
            <video key={mediaSrc} src={mediaSrc} autoPlay loop muted playsInline
              className="absolute inset-0 w-full h-full object-fill" />
          ) : (
            <img key={mediaSrc} src={mediaSrc} alt="resultado"
              className="absolute inset-0 w-full h-full object-fill" />
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
