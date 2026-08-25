"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import type { StyleProfile } from "@/app/services/admin/styleService";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import { getPhotoBoothPromptById } from "@/app/services/photo-booth/brandService";
import {
  LOADER_LOGO_HEIGHT,
  scaledLogoStyle,
} from "@/app/components/photo-booth/logoBarSizing";

// No hay progreso real del backend (el doc de imageTasks solo pasa de
// "queued" a "done", sin pasos intermedios), así que el anillo sube
// animado hasta PROGRESS_CAP a lo largo de ESTIMATED_DURATION_MS (duración
// típica de una generación) y se queda esperando ahí — el wizard desmonta
// este componente apenas Firestore marca "done", así nunca se ve "trabado"
// en 99% ni llega a 100% antes de que la imagen esté lista de verdad.
const ESTIMATED_DURATION_MS = 18000;
const PROGRESS_CAP = 92;

export default function LoaderStep({
  brandIdOverride,
}: {
  /** Modo espejo (BoothMirror): id de marca transmitido por el líder, en vez
   * de leerlo de sessionStorage("selectedBrand") — ese valor es por-pestaña,
   * así que la pantalla espejo nunca lo tiene (la selección ocurre en la
   * tablet líder, no acá). */
  brandIdOverride?: string | null;
} = {}) {
  const [dots, setDots] = useState("");
  const [style, setStyle] = useState<StyleProfile | null>(null);
  const [event, setEvent] = useState<EventProfile | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return; // evita animación si el usuario lo prefiere

    const id = setInterval(
      () => setDots((p) => (p.length < 3 ? p + "." : "")),
      500
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      let data = sessionStorage.getItem("currentEvent");
      if (data) {
        const parsed = JSON.parse(data);
        setEvent(parsed);
        // Usar el evento como estilo si está disponible
        setStyle(parsed);
      } else {
        data = sessionStorage.getItem("photoBoothStyle");
        if (data) {
          const parsed = JSON.parse(data);
          setStyle(parsed);
        }
      }

      // Nombre de marca/estilo para el badge, a partir del brand elegido
      // (guardado en sessionStorage por EventPhotoBoothLanding / el wizard) —
      // o el transmitido por el líder, en modo espejo.
      const brandId = brandIdOverride ?? sessionStorage.getItem("selectedBrand");
      if (brandId) {
        getPhotoBoothPromptById(brandId)
          .then((prompt) => {
            if (prompt) setBrandName(prompt.brandName || prompt.brand || null);
          })
          .catch(() => {
            // Silently continue sin badge si falla
          });
      }
    } catch (e) {
      // Error reading sessionStorage
    }
  }, [brandIdOverride]);

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(
        PROGRESS_CAP,
        Math.round((elapsed / ESTIMATED_DURATION_MS) * PROGRESS_CAP)
      );
      setProgress(pct);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);

  // Priorizar loadingPageImage del evento, si no usar bgLoading, bgLanding, etc
  const bgUrl = event?.loadingPageImage
    ? event.loadingPageImage
    : style
    ? style.bgLoading || style.bgLanding || "/Lenovo/app-avatars-01.png"
    : "/Lenovo/app-avatars-01.png";

  // Título y subtítulo personalizables por evento (subtítulo con default
  // genérico, igual que el título, para que siempre se vea algo aunque el
  // evento no lo haya configurado todavía).
  const loadingMessage = event?.loadingMessage || "Generando imagen";
  const loadingSubtitle = event?.loadingSubtitle || "Estamos creando tu imagen";
  const loadingTitleColor = event?.loadingTitleColor || "#ef4444";
  const loadingSubtitleColor = event?.loadingSubtitleColor || "#1a1a1a";
  const loadingProgressColor = event?.loadingProgressColor || "#ef4444";
  const loadingProgressTrackColor = event?.loadingProgressTrackColor || "rgba(0,0,0,0.15)";
  const loadingPercentColor = event?.loadingPercentColor || "#000000";

  // Controlar si mostrar logos basado en la configuración del evento
  const showLogos = event?.showLogosInLoader !== false && style !== null;

  const topLogo = showLogos
    ? (event?.logoTop || style?.logoLoadingTop || style?.logoLandingTop || null)
    : null;

  const bottomLogo = showLogos
    ? (event?.logoBottom || style?.logoLoadingBottom || style?.logoLandingBottom || null)
    : null;

  const ringSize = 128;
  const strokeWidth = 10;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center text-white">
      {/* Fondo */}
      <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url('${bgUrl}')` }} aria-hidden />
      {/* Velo para legibilidad */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Logos: juntos arriba, lado a lado */}
      {(topLogo || bottomLogo) && (
        <div
          /* Con los dos logos van uno a cada lado; con uno solo va centrado.
             Antes era `justify-between` fijo con un <span/> vacío haciendo de
             relleno, así que si faltaba uno el otro quedaba pegado a un
             costado en vez de centrado. */
          className={`relative z-20 flex-shrink-0 w-full flex items-center gap-4 px-6 ${
            topLogo && bottomLogo ? "justify-between" : "justify-center"
          }`}
          style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
        >
          {topLogo ? (
            <img
              src={topLogo}
              alt=""
              className="w-auto object-contain select-none"
              /* Misma escala configurable que el header/footer del wizard, para
                 que el tamaño elegido en el admin no "salte" al entrar y salir
                 de la pantalla de carga. El tope de viewport es más chico acá
                 (46vw) porque los dos logos van lado a lado. */
              style={scaledLogoStyle({
                baseHeight: LOADER_LOGO_HEIGHT,
                baseMaxWidth: "42vw",
                scalePct: event?.logoTopScalePct,
                viewportMaxWidth: "46vw",
              })}
              draggable={false}
            />
          ) : null}
          {bottomLogo ? (
            <img
              src={bottomLogo}
              alt=""
              className="w-auto object-contain select-none"
              style={scaledLogoStyle({
                baseHeight: LOADER_LOGO_HEIGHT,
                baseMaxWidth: "42vw",
                scalePct: event?.logoBottomScalePct,
                viewportMaxWidth: "46vw",
              })}
              draggable={false}
            />
          ) : null}
        </div>
      )}

      {/* Contenido central */}
      <div className="relative z-20 flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-5 px-6">
        {/* Anillo de progreso (simulado — el backend no reporta % real).
            El viewBox usa unidades fijas (ringSize) solo para la matemática
            del círculo; el tamaño visual real lo da el wrapper con clamp(),
            así queda responsive en cualquier pantalla. */}
        <div
          className="relative"
          style={{ width: "clamp(125px, 16vmin, 185px)", height: "clamp(125px, 16vmin, 185px)" }}
        >
          <svg
            viewBox={`0 0 ${ringSize} ${ringSize}`}
            className="-rotate-90 w-full h-full"
          >
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke={loadingProgressTrackColor}
              strokeWidth={strokeWidth}
            />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke={loadingProgressColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.2s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="font-black drop-shadow-sm"
              style={{ fontSize: "clamp(1.7rem, 4.5vmin, 2.5rem)", color: loadingPercentColor }}
            >
              {progress}%
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-center font-black uppercase tracking-tight drop-shadow-sm"
            style={{ fontSize: "clamp(1.75rem, 5vmin, 2.6rem)", color: loadingTitleColor }}
            role="status"
            aria-live="polite"
          >
            {loadingMessage}
          </h1>

          {loadingSubtitle && (
            <p
              className="text-center font-semibold drop-shadow-sm"
              style={{ fontSize: "clamp(1rem, 2.6vmin, 1.35rem)", color: loadingSubtitleColor }}
            >
              {loadingSubtitle}
              {dots}
            </p>
          )}
        </div>

        {brandName && (
          <div className="inline-flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span
              className="font-semibold text-black"
              style={{ fontSize: "clamp(0.95rem, 2.3vmin, 1.2rem)" }}
            >
              Estilo: {brandName}
            </span>
          </div>
        )}
      </div>

      <div
        className="relative z-20 flex-shrink-0 pb-6 text-white/90 font-bold tracking-[0.2em] uppercase drop-shadow-sm"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          fontSize: "clamp(0.75rem, 1.8vmin, 1rem)",
        }}
      >
        Generando con IA
      </div>
    </div>
  );
}
