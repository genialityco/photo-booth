"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { getEventProfileBySlug, EventProfile } from "@/app/services/photo-booth/eventService";
import SplashScreen from "@/app/components/photo-booth/SplashScreen";
import EventPhotoBoothLanding from "@/app/components/photo-booth/EventPhotoBoothLanding";
import PhotoBoothWizard from "@/app/components/photo-booth/PhotoBoothWizard";
import LoadingScreen from "@/app/components/common/LoadingScreen";
import ScreenSaver from "@/app/components/common/ScreenSaver";
import HandCursorOverlay from "@/app/components/common/hand-cursor/HandCursorOverlay";
import BackgroundAnimation from "@/app/components/common/BackgroundAnimation";
import { useBoothLiveSession } from "@/app/components/photo-booth/useBoothLiveSession";
import BoothMirror from "@/app/components/photo-booth/BoothMirror";

export default function EventBoothPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = React.use(params);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"splash" | "landing" | "wizard">("landing");
  const [skipBrandSelection, setSkipBrandSelection] = useState(false);
  const [boxSize, setBoxSize] = useState("min(80vw, 80vh)");

  useEffect(() => {
    const handleResize = () => {
      setBoxSize(window.innerWidth < 640 ? "100%" : "min(80vw, 80vh)");
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        setLoading(true);
        const eventData = await getEventProfileBySlug(slug);
        if (!eventData) {
          setError("Evento no encontrado");
          return;
        }
        setEvent(eventData);
        // Store event config in sessionStorage for PhotoBoothWizard to access
        sessionStorage.setItem("currentEvent", JSON.stringify(eventData));

        // Si el evento tiene solo una brand, o si captura primero está
        // activado (la selección de filtro pasa a vivir dentro del wizard,
        // después de la foto), saltar la pantalla de selección de marca.
        const singleBrand = !!eventData.prompts && eventData.prompts.length === 1;
        if (singleBrand) {
          setSkipBrandSelection(true);
          // Guardar la única brand en sessionStorage
          sessionStorage.setItem("selectedBrand", eventData.prompts[0]);
        }
        const skipLanding = singleBrand || eventData.captureBeforeFilter === true;

        setPhase(eventData.showSplashScreen ? "splash" : skipLanding ? "wizard" : "landing");
      } catch (err) {
        console.error("Error loading event:", err);
        setError("Error cargando el evento");
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [slug]);

  // Determina si este tab es la tablet interactiva ("leader") o una pantalla
  // espejo pasiva de otra tab/dispositivo con el mismo evento ya activo — ver
  // useBoothLiveSession. Se llama siempre (regla de hooks), aunque `event`
  // todavía no haya cargado: el hook queda en "pending" hasta tener un id.
  const liveSession = useBoothLiveSession(
    event?.id ?? null,
    event?.mirrorScreenEnabled !== false
  );

  // Mantiene sincronizada la fase "splash"/"landing" de ESTA página (antes de
  // que exista un PhotoBoothWizard montado) — una vez en "wizard", el propio
  // PhotoBoothWizard transmite su paso interno con más detalle vía
  // onLiveState, así que acá no hace falta (ni se debe) pisarlo.
  useEffect(() => {
    if (liveSession.role !== "leader") return;
    if (phase === "wizard") return;
    liveSession.broadcast({ phase });
  }, [phase, liveSession]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !event) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-black">
        <div className="text-white text-center">
          <p className="text-xl">{error || "Evento no encontrado"}</p>
          <Link href="/" className="mt-4 inline-block px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (liveSession.role === "pending") {
    return <div className="fixed inset-0 bg-black" />;
  }

  if (liveSession.role === "mirror") {
    return <BoothMirror event={event} state={liveSession.state} isStale={liveSession.isStale} />;
  }

  const { broadcast } = liveSession;

  // "Volver a la selección" solo tiene sentido si hay una fase "landing" a la
  // que volver: no aplica con una sola brand, ni con captura primero (ahí la
  // selección de filtro vive dentro del wizard, no como fase de esta página).
  const canReturnToLanding = !skipBrandSelection && event.captureBeforeFilter !== true;

  return (
    <div className="antialiased h-full w-full relative overflow-hidden">
      {/* ScreenSaver - se activa después de 15 segundos de inactividad */}
      <ScreenSaver
        splashImage={event.splashImage}
        videoUrl={event.screenSaverVideoUrl}
        inactivityTimeout={150000}
      />

      {/* Cursor por gestos de mano - activo en toda la app si el evento lo habilita */}
      <HandCursorOverlay enabled={event.handCursorEnabled === true} />

      {/* Fondo persistente: evita que se vea un flash sin fondo durante las
          transiciones entre fases (todas usan su propio fondo "fixed", que se
          desmonta/monta con el AnimatePresence). */}
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: `url('${event.bgImage || "/images/placeholder.png"}')` }}
        aria-hidden
      />

      {/* Animación de fondo opcional (ej. esferas de colores), configurable
          por evento — sin animación por defecto. */}
      <BackgroundAnimation type={event.backgroundAnimation} />

      <AnimatePresence mode="wait" initial={false}>
        {phase === "splash" && (
          <motion.div
            key="splash"
            className="w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <SplashScreen
              event={event}
              onStart={() => {
                const skipLanding = skipBrandSelection || event.captureBeforeFilter === true;
                setPhase(skipLanding ? "wizard" : "landing");
              }}
            />
          </motion.div>
        )}

        {phase === "landing" && (
          <motion.div
            key="landing"
            className="w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <EventPhotoBoothLanding
              event={event}
              onStart={(brand, dataProcessingAccepted) => {
                // Guardar brand en sessionStorage para que PhotoBoothWizard lo use
                if (brand) sessionStorage.setItem("selectedBrand", brand);
                // Guardar aceptación de tratamiento de datos
                if (dataProcessingAccepted !== undefined) {
                  sessionStorage.setItem("dataProcessingAccepted", String(dataProcessingAccepted));
                }
                setPhase("wizard");
              }}
            />
          </motion.div>
        )}

        {phase === "wizard" && (
          <motion.div
            key="wizard"
            className="w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <PhotoBoothWizard
              mirror
              boxSize={boxSize}
              eventData={event}
              onReset={canReturnToLanding ? () => setPhase("landing") : undefined}
              onLiveState={broadcast}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
