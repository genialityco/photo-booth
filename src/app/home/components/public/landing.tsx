/* eslint-disable @next/next/no-img-element */
/* app/components/Landing.tsx */
"use client";
import React from "react";
import ButtonPrimary from "../../../items/ButtonPrimary";

type BrandKey = "juan-valdez" | "colombina" | "frisby";

type XY = { x?: number; y?: number };

type BrandConfig = {
  k: BrandKey;
  logo: string;
  aria: string;
  logoScale?: number;
  logoTranslate?: XY;
  logoMaxHeight?: number;
  cardScale?: number;
  cardTranslate?: XY;
  cardHeight?: number;
};

const BRANDS: BrandConfig[] = [
  {
    k: "juan-valdez",
    logo: "/fenalco/inicio/LOGO-JUAN-VALDEZ.png",
    aria: "Comenzar con Juan Valdez",
    logoScale: 2.3,
    logoTranslate: { x: 0, y: 0 },
    logoMaxHeight: 120,
    cardScale: 0.85,
    cardTranslate: { x: 0, y: 0 },
    cardHeight: 220,
  },
  {
    k: "colombina",
    logo: "/fenalco/inicio/LOGO-COLOMBINA.png",
    aria: "Comenzar con Colombina",
    logoScale: 2.1,
    logoTranslate: { x: 0, y: 2 },
    logoMaxHeight: 120,
    cardScale: 0.85,
    cardTranslate: { x: 0, y: 0 },
    cardHeight: 220,
  },
  {
    k: "frisby",
    logo: "/fenalco/inicio/LOGO-FRISBY.png",
    aria: "Comenzar con Frisby",
    logoScale: 2.3,
    logoTranslate: { x: 0, y: -2 },
    logoMaxHeight: 120,
    cardScale: 0.85,
    cardTranslate: { x: 0, y: 0 },
    cardHeight: 220,
  },
];

export default function Landing({
  onStart,
}: {
  onStart: (brand: BrandKey) => void;
}) {
  const handleStart = (brand: BrandKey) => {
    // ✅ Actualiza la URL sin recargar
    const params = new URLSearchParams(window.location.search);
    params.set("brand", brand.replace("-", ""));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);

    // Llama al callback existente
    onStart(brand);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: "url('/fenalco/inicio/FONDO_HOME_EMB_MARCA.jpg')",
        }}
        aria-hidden
      />

      {/* Centrado total sin scroll */}
      <div className="mx-auto flex h-dvh max-w-4xl flex-col items-center justify-center overflow-hidden">
        {/* Título */}
        <div className="mb-20 w-full max-w-md sm:max-w-lg lg:max-w-xl">
          <img
            src="/fenalco/inicio/TITULO_80-ANIOS.png"
            alt="Embajadores de Marca - 80 años Fenalco"
            className="w-full select-none"
            draggable={false}
          />
        </div>

        {/* Grid de marcas */}
        <div className=" grid w-full px-8 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 lg:max-w-2xl overflow-hidden">
          {BRANDS.map((b) => {
            const logoScale = b.logoScale ?? 1;
            const logoTx = b.logoTranslate?.x ?? 0;
            const logoTy = b.logoTranslate?.y ?? 0;

            return (
              <article
                key={b.k}
                className="flex w-full flex-col items-center rounded-2xl shadow-lg"
              >
                <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-xl bg-white overflow-hidden">
                  <img
                    src={b.logo}
                    alt={b.aria}
                    className="select-none object-contain"
                    style={{
                      maxHeight: (b.logoMaxHeight ?? 120) + "px",
                      maxWidth: "50%",
                      transform: `translate(${logoTx}px, ${logoTy}px) scale(${logoScale})`,
                      transformOrigin: "center",
                    }}
                    draggable={false}
                  />
                </div>

                <ButtonPrimary
                  onClick={() => handleStart(b.k)}
                  ariaLabel={b.aria}
                  label="COMENZAR"
                  imageSrc="/fenalco/inicio/BOTON-COMENZAR.png"
                  width={160}
                  height={40}
                  className="relative mx-auto block text-white"
                  textClassName="text-white"
                />
              </article>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-auto w-full px-8">
          <img
            src="/fenalco/inicio/LOGOS_COLOR_UNA-LINEA.png"
            alt="Logos Footer"
            className="w-full select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
