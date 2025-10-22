/* eslint-disable @next/next/no-img-element */
/* app/components/Landing.tsx */
"use client";
import React from "react";

type BrandKey = "juan-valdez" | "colombina" | "frisby";
type BrandConfig = { k: BrandKey; logo: string; aria: string };

const BRANDS: BrandConfig[] = [
  {
    k: "juan-valdez",
    logo: "/fenalco/inicio/LOGO-JUAN-VALDEZ.png",
    aria: "Comenzar con Juan Valdez",
  },
  {
    k: "colombina",
    logo: "/fenalco/inicio/LOGO-COLOMBINA.png",
    aria: "Comenzar con Colombina",
  },
  {
    k: "frisby",
    logo: "/fenalco/inicio/LOGO-FRISBY.png",
    aria: "Comenzar con Frisby",
  },
];

export default function Landing({ onStart }: { onStart: (brand: BrandKey) => void }) {
  const handleStart = (brand: BrandKey) => {
    const params = new URLSearchParams(window.location.search);
    params.set("brand", brand.replace("-", ""));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
    onStart(brand);
  };

  return (
    <div
      className="relative min-h-[100svh] w-full overflow-hidden"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Fondo */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "url('/fenalco/inicio/FONDO_HOME_EMB_MARCA.jpg')" }}
        aria-hidden
      />

      {/* Contenido */}
      <div className="mx-auto flex min-h-[100svh] max-w-[980px] flex-col items-center">
        {/* Título/Logo */}
        <div className="w-full px-5 sm:px-6 md:px-8 pt-3 sm:pt-4 md:pt-6">
          <img
            src="/fenalco/inicio/TITULO_80-ANIOS.png"
            alt="Embajadores de Marca - 80 años Fenalco"
            className="mx-auto w-full max-w-[620px] select-none"
            draggable={false}
          />
        </div>

        {/* Texto guía (exacto) */}
        <h1 className="mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-xl font-semibold text-white drop-shadow-md">
          ¡Escoge una de estas queridas marcas!
        </h1>

        {/* Grid: 2 cols en mobile, 3 en iPad+ */}
        <div className="mt-5 sm:mt-7 w-full px-5 sm:px-6 md:px-8">
          <div
            className="
              grid gap-3 sm:gap-4 md:gap-5
              grid-cols-2
              md:grid-cols-3
            "
          >
            {BRANDS.map((b) => (
              <article
                key={b.k}
                role="button"
                tabIndex={0}
                aria-label={b.aria}
                title={b.aria}
                onClick={() => handleStart(b.k)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleStart(b.k);
                }}
                className="
                  group cursor-pointer select-none
                  rounded-xl sm:rounded-2xl
                  backdrop-blur
                  shadow-md sm:shadow-xl ring-1 ring-black/5
                  transition-transform duration-150
                  supports-[hover:hover]:hover:scale-[1.015]
                  active:scale-[0.985]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                "
              >
                {/* Contenedor con padding para que el logo nunca toque bordes */}
                <div className="flex w-full items-center justify-center overflow-hidden rounded-xl sm:rounded-2xl">
                  {/* Altura adaptable sin recorte; en móvil 4/3, en iPad cuadrado */}
                  <div className="w-full">
                    <div className="relative w-full aspect-[4/3] md:aspect-square">
                      <img
                        src={b.logo}
                        alt={b.aria}
                        className="
                          absolute inset-0 w-full h-full
                          object-contain
                        "
                        draggable={false}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto w-full px-5 sm:px-6 md:px-8 pb-3 sm:pb-4 md:pb-6">
          <img
            src="/fenalco/inicio/LOGOS_COLOR_UNA-LINEA.png"
            alt="Logos Footer"
            className="mx-auto w-full max-w-[980px] select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
