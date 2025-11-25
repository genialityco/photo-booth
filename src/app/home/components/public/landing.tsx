/* eslint-disable @next/next/no-img-element */
/* app/components/Landing.tsx */
"use client";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import React from "react";

type BrandKey = "suredColBog" | "suredColMed" | "suredColHui" | "suredIntNY" | "suredIntDB" |"suredIntTK";
// Actualizamos BrandConfig para que 'k' sea un array de BrandKey
type BrandConfig = { k: string[]; logo: string; aria: string }; 

// Función auxiliar para obtener un elemento aleatorio de un array
const getRandomElement = <T,>(arr: T[]): T => {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
};

// Actualizamos BRANDS con un array de BrandKey en la propiedad 'k'
export const BRANDS: BrandConfig[] = [
  {
    k: ["suredColBog", "suredColMed", "suredColHui"],
    logo: "/suRed/home/BOTON-COLOMBIA.png",
    aria: "Comenzar con Juan Valdez",
  },
  {
    k: ["suredIntNY", "suredIntDB", "suredIntTK"],
    logo: "/suRed/home/BOTON-MUNDO.png",
    aria: "Comenzar con Alpina",
  },
];

// Helper para obtener la configuración de una marca por su key (Opcional: Si lo sigues usando en otras partes)
export const getBrandConfig = (brandKey: string): BrandConfig | null => {
  if (!brandKey) return null;
  // Busca si el brandKey está incluido en el array 'k' de alguna BrandConfig
  return (
    BRANDS.find((b) => b.k.includes(brandKey)) ||
    null
  );
};

export default function Landing({
  onStart,
}: {
  onStart: (brand: string) => void;
}) {
  // Ahora handleStart recibe el array de posibles BrandKey
  const handleStart = (possibleBrands: string[]) => {
    // 1. Escoge una clave aleatoria del array
    const selectedBrand = getRandomElement(possibleBrands);

    // 2. Modifica la URL con la clave aleatoria
    const params = new URLSearchParams(window.location.search);
    params.set("brand", selectedBrand.replace("-", ""));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
    
    // 3. Llama a onStart con la clave aleatoria
    onStart(selectedBrand);
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
            {BRANDS.map((b) => (
              <article
                key={b.k.join(',')} // Usamos el array unido como key
                role="button"
                tabIndex={0}
                aria-label={b.aria}
                title={b.aria}
                onClick={() => handleStart(b.k)} // Pasamos el array 'k' al handler
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
                <div className="flex w-full items-center justify-center overflow-hidden">
  <div className="w-full flex justify-between">
    <div className=" w-full flex justify-center  md:aspect-square">
      <div className=" absolute flex items-center justify-center  rounded-[30px]">
        <img
          src={b.logo}
          alt={b.aria}
          className=" object-contain"
          draggable={false}
        />
      </div>
    </div>
  </div>
</div>
              </article>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto w-full px-5 sm:px-6 md:px-8 pb-3 sm:pb-4 md:pb-6 relative -top-10">
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