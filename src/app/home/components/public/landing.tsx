/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState } from "react";
import { QueryDocumentSnapshot } from "firebase/firestore";
import {
  createPhotoBoothPrompt,
  deletePhotoBoothPrompt,
  getPhotoBoothPrompts,
  getPhotoBoothPromptsHome,
  PhotoBoothPrompt,
  updatePhotoBoothPrompt,
} from "@/app/services/brandService";


const columns = [
  {
    key: "brand",
    label: "Brand",
    sortable: true,
    render: (item: PhotoBoothPrompt, value: string) => <strong>{value}</strong>,
  },
 
];

interface PaginationState {
  currentPage: number;
  totalPages: number | null;
  pages: Array<{
    pageNumber: number;
    lastDoc: QueryDocumentSnapshot | null;
  }>;
}



   export default function Landing({
  onStart,
}: {
  onStart: (brand: string) => void;
}) {
    const [prompts, setPrompts] = useState<PhotoBoothPrompt[]>([]);
  const [color, setColor] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalPages: null,
    pages: [{ pageNumber: 1, lastDoc: null }],
  });

  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalElements, setTotalElements] = useState<number>(0);
  const pageSize = 10;

  // Ahora handleStart recibe el array de posibles BrandKey
  const handleStart = (selectedBrand: string) => {
    // 1. Escoge una clave aleatoria del array
    

    // 2. Modifica la URL con la clave aleatoria
    const params = new URLSearchParams(window.location.search);
    params.set("brand", selectedBrand.replace("-", ""));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);

    // 3. Llama a onStart con la clave aleatoria
    onStart(selectedBrand);
  };
 const loadPrompts = async (
    lastDocParam: QueryDocumentSnapshot | null = null,
    pageNumber: number = 1
  ) => {
    
    try {
      const result = await getPhotoBoothPromptsHome();
      setPrompts(result);
      
      const calculatedTotalPages = Math.ceil(totalElements / pageSize);

      setTotalPages(calculatedTotalPages);
      setTotalElements(totalElements);

     

      console.log("Loaded prompts:", result);
    } catch (error) {
      console.error("Error loading prompts:", error);
    } finally {
     
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

 







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
      className="fixed inset-0 -z-10 bg-cover bg-center brightness-[0.92]"
      style={{
        backgroundImage: "url('suRed/home/FONDO_UNIENDO-AL-MUNDO_HOME.jpg')",
      }}
      aria-hidden
    />

    {/* Contenido */}
    <div className="mx-auto flex min-h-[100svh] max-w-[700px] flex-col items-center">

      {/* Logo + Título */}
      <div className="w-full px-6 pt-6 md:pt-10">
        <img
          src="/suRed/home/LOGOS-JUNTOS.png"
          alt="LOGOS SURED"
          className="mx-auto w-full max-w-[480px] select-none drop-shadow-lg"
          draggable={false}
        />
        <img
          src="/suRed/home/TITULO-UNIENDO-AL-MUNDO.png"
          alt="UNIENDO AL MUNDO"
          className="mx-auto mt-3 w-full max-w-[720px] select-none drop-shadow-md"
          draggable={false}
        />
      </div>

      {/* Texto guía */}
      <h1 className="mt-10 text-center text-lg md:text-xl font-semibold text-white drop-shadow-xl tracking-wide">
        Selecciona una marca para comenzar
      </h1>

      {/* Grid de marcas */}
      <div className="mt-8 w-full px-6">
        <div className="grid grid-cols-2 gap-4 sm:gap-5">

          {prompts.map((b) => (
            <article
              key={b.brand}
              role="button"
              tabIndex={0}
              title={b.brand}
              onClick={() => handleStart(b.brand || "default")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleStart(b.brand || "default");
              }}
              className="
                group cursor-pointer select-none
                rounded-2xl p-5
                bg-white/90 backdrop-blur-sm
                border border-white/40
                shadow-[0_6px_20px_rgba(0,0,0,0.15)]
                transition-all duration-200
                hover:scale-105 hover:shadow-[0_10px_24px_rgba(0,0,0,0.25)]
                active:scale-95
                text-center font-semibold text-gray-800
              "
            >
              <div className="text-base sm:text-lg font-bold tracking-wide">
                {b.brand}
              </div>
            </article>
          ))}

        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto w-full px-4 pb-4 md:pb-6 relative -top-20">
        <img
          src="/suRed/home/COPY-FOOTER.png"
          alt="Footer Logos"
          className="mx-auto w-full select-none drop-shadow"
          draggable={false}
        />
      </div>
    </div>

  </div>
);

}
