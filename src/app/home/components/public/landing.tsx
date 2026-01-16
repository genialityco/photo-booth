/* eslint-disable @next/next/no-img-element */
/* app/components/Landing.tsx */
"use client";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import React from "react";

type BrandKey = "BANDERA_COLOMBIA" | "BANDERA_MEXICO";
type BrandConfig = { k: BrandKey; logo: string; aria: string };

const BRANDS: BrandConfig[] = [
  {
    k: "BANDERA_COLOMBIA",
    logo: "/COLOR_WORLD/CORTES/COLOMBIA.png",
    aria: "Bandera de Colombia",
  },
  {
    k: "BANDERA_MEXICO",
    logo: "/COLOR_WORLD/CORTES/MEXICO.png",
    aria: "Bandera de México",
  },
];

export default function Landing({
  onStart,
}: {
  onStart: (brand: BrandKey) => void;
}) {
  const handleStart = (brand: BrandKey) => {
    const params = new URLSearchParams(window.location.search);
    params.set("brand", brand.replace("-", ""));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
    onStart(brand);
  };

  // NUEVO: elegir una marca aleatoria
  const pickRandomBrand = (): BrandKey => {
    if (!BRANDS.length) throw new Error("No hay marcas configuradas.");
    const idx = Math.floor(Math.random() * BRANDS.length);
    return BRANDS[idx].k;
  };

  // NUEVO: handler para el título
  const handleTitlePick = () => {
    const random = pickRandomBrand();
    handleStart(random);
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
        style={{
          backgroundImage:
            "url('/COLOR_WORLD/CORTES/FONDO-SELECCION_PAIS.PNG')",
        }}
        aria-hidden
      />

      {/* Contenido */}
      <div className="mx-auto flex min-h-[100svh] max-w-[980px] flex-col items-center">
        {/* Título/Logo */}
        <div className="w-full px-5 sm:px-6 md:px-8 pt-3 sm:pt-4 md:pt-6">
          <div className="mx-auto w-full max-w-[620px] flex flex-col items-center gap-2">
            {/* <img
              src="/Lenovo/app-avatars-02.png"
              alt="GEN.IALITY LOGO"
              className="w-full select-none"
              draggable={false}
            /> */}

            {/* NUEVO: imagen de título clickeable para elegir marca aleatoria */}
            {/* <img
              src="/Lenovo/app-avatars-03.png"
              alt="Título Gen.iality (clic para elegir una marca al azar)"
              className="w-full select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-lg"
              role="button"
              tabIndex={0}
              aria-label="Elegir una marca al azar"
              draggable={false}
              onClick={handleTitlePick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault(); // evita doble activación con espacio
                  handleTitlePick();
                }
              }}
              title="Haz clic para sorprenderte con una marca al azar"
            /> */}
          </div>
        </div>

        {/* Texto guía (exacto) */}
        {/* <h1 className="mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-xl font-semibold text-white drop-shadow-md">
          Selecciona tu evolución...{" "}
        </h1> */}

        {/* Grid: 2 cols en mobile, 3 en iPad+ */}
        <div className="mt-5 sm:mt-160 w-full px-5 sm:px-6 md:px-8">
          <div
            className="
              grid gap-2 sm:gap-4 md:gap-5
              grid-cols-2
              md:grid-cols-2
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
                className=""
              >
                <div className="flex w-full flex-col items-center justify-center overflow-hidden">
                  {/* Imagen */}
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
                        style={{
                          borderRadius: "30px",
                          paddingLeft:
                            b.logo?.includes("macpollo") ||
                            b.logo?.includes("colombina")
                              ? "20px"
                              : "0",
                          paddingRight:
                            b.logo?.includes("macpollo") ||
                            b.logo?.includes("colombina")
                              ? "20px"
                              : "0",
                        }}
                      />
                    </div>
                  </div>

                  {/* Texto debajo de la imagen */}
                  <div className="w-full px-4 py-2">
                    <ButtonPrimary
                      imageSrc="/COLOR_WORLD/CORTES/BOTON-GRANDE.png"
                      label={b.aria}
                      onClick={() => handleStart(b.k)}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto w-full px-5 sm:pb-4 md:pb-6 pb-3 sm:px-6 md:px-8">
          {/* <img
            src="/Lenovo/app-avatars-04.png" //"/congresoEdu/Logo-congreso-v2.png"
            alt="Logos Footer"
            className="mx-auto w-full max-w-[980px] select-none"
            draggable={false}
          /> */}
        </div>
      </div>
    </div>
  );
}
