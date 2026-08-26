"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import MediaTapScreen from "@/app/components/common/MediaTapScreen";

const GALLERY_PHOTO_LIMIT = 20;

type GalleryPhoto = { id: string; url?: string; videoUrl?: string };

const NOOP = () => {};

/**
 * Slide de galería del ScreenSaver: se suscribe en vivo a las fotos ya
 * generadas del evento (`imageTasks` con status "done") y las muestra de a
 * una, a pantalla completa, con crossfade cada `photoIntervalSec`. Se
 * mantiene montado durante toda la vida del ScreenSaver (no solo cuando es
 * el slide activo) para que `onPhotosChange` le avise al rotador si hay
 * contenido ANTES de que le toque el turno — ver ScreenSaverSlideshow.
 */
export default function ScreenSaverGallery({
  eventId,
  photoIntervalSec = 4,
  onPhotosChange,
}: {
  eventId: string;
  photoIntervalSec?: number;
  onPhotosChange?: (count: number) => void;
}) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, "imageTasks"),
      where("eventId", "==", eventId),
      where("status", "==", "done"),
      orderBy("finishedAt", "desc"),
      limit(GALLERY_PHOTO_LIMIT)
    );

    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((d) => {
        const data = d.data() as { url?: string; videoUrl?: string };
        return { id: d.id, url: data.url, videoUrl: data.videoUrl };
      });
      setPhotos(next);
      onPhotosChange?.(next.length);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    setCurrentIndex((i) => (photos.length > 0 ? i % photos.length : 0));
  }, [photos.length]);

  useEffect(() => {
    if (photos.length < 2) return;
    const id = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % photos.length);
    }, photoIntervalSec * 1000);
    return () => clearInterval(id);
  }, [photos.length, photoIntervalSec]);

  if (photos.length === 0) return null;

  const current = photos[currentIndex];

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <AnimatePresence>
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          <MediaTapScreen imageUrl={current.url} videoUrl={current.videoUrl} onTap={NOOP} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
