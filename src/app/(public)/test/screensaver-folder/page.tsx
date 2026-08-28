"use client";

// Banco de pruebas de las pantallas ANIMADAS del ScreenSaver
// (ScreenSaverPhotoFolder y ScreenSaverEditorialGrid). Existe para poder verlas
// en loop sin tener que dejar un booth quieto hasta que salte la inactividad, y
// para poder ajustarles el ritmo de la coreografía en el momento.
//
// Uso: /test/screensaver-folder?slug=b_security_andicom&dur=12&anim=editorial
//   slug: evento del que salen las fotos (default: b_security_andicom).
//   dur:  segundos que dura una pasada completa (default: el
//         screenSaverSlideDurationSec del evento, o 10).
//   anim: "folder" | "editorial" (default: el screenSaverAnimationType del
//         evento, o la carpeta).

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ScreenSaverPhotoFolder from "@/app/components/common/ScreenSaverPhotoFolder";
import ScreenSaverEditorialGrid from "@/app/components/common/ScreenSaverEditorialGrid";
import {
  getEventProfileBySlug,
  type EventProfile,
} from "@/app/services/photo-booth/eventService";

const DEFAULT_SLUG = "b_security_andicom";

function TestContent() {
  const sp = useSearchParams();
  const slug = sp.get("slug") || DEFAULT_SLUG;
  const durParam = Number(sp.get("dur"));
  const animParam = (sp.get("anim") || "").toUpperCase();

  const [event, setEvent] = useState<EventProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getEventProfileBySlug(slug)
      .then((ev) => {
        if (!alive) return;
        if (!ev) setError(`No se encontró un evento activo con slug "${slug}"`);
        else setEvent(ev);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white p-8 text-center">
        {error}
      </div>
    );
  }

  if (!event) {
    return <div className="fixed inset-0 bg-[#f4f5f7]" />;
  }

  const animation =
    animParam === "EDITORIAL" || animParam === "FOLDER"
      ? animParam
      : event.screenSaverAnimationType || "FOLDER";
  const durationSec =
    Number.isFinite(durParam) && durParam > 0
      ? durParam
      : event.screenSaverSlideDurationSec ?? 10;

  return (
    <div className="fixed inset-0">
      {animation === "EDITORIAL" ? (
        <ScreenSaverEditorialGrid
          eventId={event.id}
          promptIds={event.prompts}
          active
          durationSec={durationSec}
          texts={event.screenSaverEditorialTexts}
        />
      ) : (
        <ScreenSaverPhotoFolder
          eventId={event.id}
          promptIds={event.prompts}
          aspectRatio={event.photoAspectRatio}
          active
          durationSec={durationSec}
          label={event.screenSaverFolderLabel?.trim() || event.name}
          logoUrl={event.screenSaverFolderLogo?.trim() || event.logoTop}
        />
      )}
    </div>
  );
}

export default function ScreenSaverFolderTestPage() {
  return (
    <React.Suspense fallback={<div className="fixed inset-0 bg-[#f4f5f7]" />}>
      <TestContent />
    </React.Suspense>
  );
}
