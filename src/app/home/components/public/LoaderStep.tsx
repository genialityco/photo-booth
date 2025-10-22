"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function LoaderStep() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return; // evita animación si el usuario lo prefiere

    const id = setInterval(
      () => setDots((p) => (p.length < 3 ? p + "." : "")),
      500
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden text-white"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Fondo */}
      <Image
        src="/fenalco/loading/FONDO_HABILITAR-CAMARA_EMB_MARCA.jpg"
        alt="Fondo decorativo"
        fill
        priority
        sizes="100vw"
        className="object-cover select-none"
        draggable={false}
      />
      {/* Velo para legibilidad */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Logo superior (opcional) */}
      <div className="absolute inset-x-0 top-6 flex justify-center z-20">
        <Image
          src="/fenalco/loading/TITULO_80-ANIOS.png"
          alt="80 años FENALCO"
          width={520}
          height={96}
          className="drop-shadow-md"
          priority
        />
      </div>

      {/* Contenido central */}
      <div className="relative z-20 flex h-full items-center justify-center px-6">
        <h1
          className="text-center text-4xl md:text-6xl font-semibold drop-shadow-lg tracking-tight"
          role="status"
          aria-live="polite"
        >
          Generando magia{dots}
        </h1>
      </div>

      {/* Footer con logos (opcional)
      <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center">
        <Image
          src="/fenalco/loading/LOGOS-FOOTER_HC.png"
          alt="Aliados y patrocinadores"
          width={520}
          height={60}
          className="opacity-90"
        />
      </div>
      */}
    </div>
  );
}
