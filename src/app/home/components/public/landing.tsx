/* eslint-disable @next/next/no-img-element */
/* app/components/Landing.tsx */
"use client";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import React from "react";

/** =========================
 *  Tipos y Config compartida
 *  ========================= */
export type BrandKey =
  | "suredColHui"
  | "suredColBog"
  | "suredColMed"
  | "suredIntNY";

export type BrandGroupKey = "BrandCol" | "BrandWorld";

export type BrandGroupCfg = {
  label: string; // Texto del botón
  logo: string; // Misma imagen por grupo
  options: BrandKey[]; // Keys reales del grupo
};

export const BRAND_GROUPS: Record<BrandGroupKey, BrandGroupCfg> = {
  BrandCol: {
    label: "Colombia",
    logo: "/suRed/home/BOTON-COLOMBIA.png",
    options: ["suredColHui", "suredColBog", "suredColMed"],
  },
  BrandWorld: {
    label: "Internacional",
    logo: "/suRed/home/BOTON-MUNDO.png",
    options: ["suredIntNY"],
  },
};

export const VISIBLE_CARDS: BrandGroupKey[] = ["BrandCol", "BrandWorld"];

/** Helper para elegir aleatorio */
export const pickRandom = <T,>(arr: T[]) =>
  arr[Math.floor(Math.random() * arr.length)];

/** Resolver brand → {logo, aria} usando imagen/label por grupo */
export function getBrandConfig(brandKey?: string | null) {
  if (!brandKey) return null;
  const key = brandKey.replace("-", "") as BrandKey;

  if (BRAND_GROUPS.BrandCol.options.includes(key)) {
    return {
      k: key,
      aria: BRAND_GROUPS.BrandCol.label,
      logo: BRAND_GROUPS.BrandCol.logo,
    };
  }
  if (BRAND_GROUPS.BrandWorld.options.includes(key)) {
    return {
      k: key,
      aria: BRAND_GROUPS.BrandWorld.label,
      logo: BRAND_GROUPS.BrandWorld.logo,
    };
  }
  return null;
}

/** =========================
 *  Componente de Landing
 *  ========================= */
export default function Landing({
  onStart,
}: {
  onStart: (brand: BrandKey) => void;
}) {
  const handleStartGroup = (groupKey: BrandGroupKey) => {
    const cfg = BRAND_GROUPS[groupKey];
    const picked = pickRandom(cfg.options); // ← elige 1 de las keys reales

    // Mostrar en consola la brand seleccionada con todos sus atributos
    const brandInfo = getBrandConfig(picked);
    console.log("Brand seleccionada:", {
      groupKey,
      picked,
      brandInfo,
      groupCfg: cfg,
    });

    const params = new URLSearchParams(window.location.search);
    params.set("brand", picked);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);

    onStart(picked);
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
          backgroundImage: "url('suRed/home/FONDO_UNIENDO-AL-MUNDO_HOME.jpg')",
        }}
        aria-hidden
      />

      {/* Contenido */}
      <div className="mx-auto flex min-h-[100svh] max-w-[700px] flex-col items-center">
        {/* Título/Logo */}
        <div className="w-full px-5 sm:px-6 md:px-8 pt-3 sm:pt-4 md:pt-6">
          <img
            src="/suRed/home/LOGOS-JUNTOS.png"
            alt="LOGOS SURED"
            className="mx-auto w-full max-w-[620px] select-none"
            draggable={false}
          />
          <img
            src="/suRed/home/TITULO-UNIENDO-AL-MUNDO.png"
            alt="UNIENDO AL MUNDO"
            className="mx-auto w-full max-w-[620px] select-none"
            draggable={false}
          />
        </div>

        {/* Texto guía */}
        {/* <h1 className="mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-xl font-semibold text-white drop-shadow-md">
          ¡Escoge una de estas queridas marcas!
        </h1> */}

        {/* Grid con SOLO 2 cards visibles */}
        <div className="mt-5 sm:mt-7 w-full px-5 sm:px-6 md:px-8">
          <div
            className="
              grid gap-3 sm:gap-4 md:gap-5
              grid-cols-2
              md:grid-cols-2
            "
          >
            {VISIBLE_CARDS.map((key) => {
              const card = BRAND_GROUPS[key];
              return (
                <article
                  key={key}
                  role="button"
                  tabIndex={0}
                  aria-label={card.label}
                  title={card.label}
                  onClick={() => handleStartGroup(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      handleStartGroup(key);
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
                  <div className="flex w-full items-center justify-center overflow-hidden">
                    <div className="w-full">
                      <figure className="w-full">
                        <div className="relative w-full aspect-[4/3] md:aspect-square overflow-hidden rounded-[30px]">
                          <img
                            src={card.logo}
                            alt={card.label}
                            draggable={false}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                        </div>

                        {/* botón centrado debajo de la imagen */}
                        <figcaption className="mt-2 text-center">
                          <ButtonPrimary
                            label={card.label}
                            imageSrc="/suRed/home/BOTON.png"
                            className="block mx-auto"
                          />
                        </figcaption>
                      </figure>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto w-full px-5 sm:px-6 md:px-8 pb-3 sm:pb-4 md:pb-6 relative -top-20">
          <img
            src="/suRed/home/COPY-FOOTER.png"
            alt="Logos Footer"
            className="mx-auto w-full max-w-full select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
