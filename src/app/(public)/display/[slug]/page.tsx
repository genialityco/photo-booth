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
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

const SCREENSAVER_VIDEO = "/screensaver.mp4";
const DISPLAY_DURATION_MS = 15000;

type DisplayItem = { id: string; url?: string; videoUrl?: string };

function DisplayContent({ eventId }: { eventId: string }) {
  const [current, setCurrent] = useState<DisplayItem | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIdRef = useRef<string | null>(null);

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
      const doc = snap.docs[0];
      const item: DisplayItem = { id: doc.id, ...(doc.data() as any) };
      if (item.id === lastIdRef.current) return;
      lastIdRef.current = item.id;

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
  }, [eventId]);

  const isVideo = !!current?.videoUrl;
  const mediaSrc = current?.videoUrl || current?.url;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
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
  );
}

export default function DisplayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = React.use(params);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) { setEventId(""); return; }
    getDocs(
      query(collection(db, "events"), where("slug", "==", slug), where("isActive", "==", true))
    ).then((snap) => setEventId(snap.empty ? "" : snap.docs[0].id));
  }, [slug]);

  if (eventId === null) return (
    <div className="fixed inset-0 bg-black" />
  );

  return <DisplayContent key={eventId} eventId={eventId} />;
}
