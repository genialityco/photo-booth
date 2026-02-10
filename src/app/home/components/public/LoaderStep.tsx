"use client";
import { useEffect, useState } from "react";
import type { StyleProfile } from "@/app/services/styleService";

export default function LoaderStep() {
  const [dots, setDots] = useState("");
  const [style, setStyle] = useState<StyleProfile | null>(null);

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
      const cached = sessionStorage.getItem("photoBoothStyle");
      if (cached) {
        const parsed = JSON.parse(cached);
        setStyle(parsed);
        console.log("[LoaderStep] loaded cached style:", parsed?.id || parsed);
      }
    } catch (e) {
      console.warn("[LoaderStep] error reading sessionStorage", e);
    }
  }, []);

  const bgUrl = style ? style.bgLoading || style.bgLanding || "/Lenovo/app-avatars-01.png" : "/Lenovo/app-avatars-01.png";
  const topLogo = style ? style.logoLoadingTop || style.logoLandingTop || "genilaty_smart_led_logo.png" : "/Lenovo/app-avatars-02.png";
  const bottomLogo = style ? style.logoLoadingBottom || style.logoLandingBottom || "genilaty_smart_led_logo.png" : "/Lenovo/app-avatars-04.png";

  return (
    <div
      className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden text-white"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Fondo */}
      <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url('${bgUrl}')` }} aria-hidden />
      {/* Velo para legibilidad */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Logo superior (opcional) */}
      <div className="absolute inset-x-0 top-30 flex justify-center z-20">
        <img src={topLogo} alt="Logo" width={520} height={96} className="drop-shadow-md select-none" draggable={false} />
      </div>

      {/* Contenido central */}
      <div className="relative z-20 flex h-full items-center justify-center px-6">
        <h1
          className="text-center text-4xl md:text-6xl font-semibold drop-shadow-lg tracking-tight"
          role="status"
          aria-live="polite"
        >
          Evolucionando{dots}
        </h1>
      </div>

      <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center">
        <img src={bottomLogo} alt="Aliados y patrocinadores" width={520} height={60} className="opacity-90 select-none" draggable={false} />
      </div>
    </div>
  );
}
