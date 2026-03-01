/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import { getPhotoBoothPromptsByIds, type PhotoBoothPrompt } from "@/app/services/photo-booth/brandService";

export default function EventPhotoBoothLanding({
  event,
  onStart,
}: {
  event: EventProfile;
  onStart?: (brand?: string, dataProcessingAccepted?: boolean) => void;
}) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PhotoBoothPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [imageLoadingStates, setImageLoadingStates] = useState<Record<string, boolean>>({});
  const [imageErrorStates, setImageErrorStates] = useState<Record<string, boolean>>({});
  const [dataProcessingAccepted, setDataProcessingAccepted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detectar tamaño de pantalla
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Cargar los prompts completos usando los IDs del evento
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setLoadingPrompts(true);
        if (event.prompts && event.prompts.length > 0) {
          const loadedPrompts = await getPhotoBoothPromptsByIds(event.prompts);
          setPrompts(loadedPrompts);

          // Seleccionar automáticamente la primera brand
          if (loadedPrompts.length > 0) {
            setSelectedBrand(loadedPrompts[0].id);
          }

          // Inicializar estados de carga para cada imagen
          const initialLoadingStates: Record<string, boolean> = {};
          loadedPrompts.forEach(prompt => {
            if (prompt.imageUrl || prompt.logoPath) {
              initialLoadingStates[prompt.id] = true;
            }
          });
          setImageLoadingStates(initialLoadingStates);
        }
      } catch (error) {
        // Error loading prompts
      } finally {
        setLoadingPrompts(false);
      }
    };

    loadPrompts();
  }, [event.prompts]);

  const handleImageLoad = (promptId: string) => {
    setImageLoadingStates(prev => ({ ...prev, [promptId]: false }));
  };

  const handleImageError = (promptId: string) => {
    setImageLoadingStates(prev => ({ ...prev, [promptId]: false }));
    setImageErrorStates(prev => ({ ...prev, [promptId]: true }));
  };

  const handleStart = () => {
    const brand = selectedBrand || (prompts.length > 0 ? prompts[0].id : "default");
    onStart?.(brand, dataProcessingAccepted);
  };

  // Determinar si el botón debe estar habilitado
  const isStartEnabled = !event.dataProcessingText || dataProcessingAccepted;

  // Determinar el grid según la cantidad de brands
  const getGridClass = () => {
    const count = prompts.length;
    if (count === 1) return "grid-cols-1 mx-auto";
    if (count === 2) return "grid-cols-2 mx-auto";
    if (count === 3) return "grid-cols-3 mx-auto";
    if (count === 4) return "grid-cols-2 sm:grid-cols-4 mx-auto";
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  };

  // Determinar el tamaño de las cards según la cantidad y el tamaño de pantalla
  const getCardSizeClass = () => {
    const count = prompts.length;
    
    // Tamaños para pantallas móviles (< 768px)
    if (isMobile) {
      if (count === 1) return "w-52 h-52"; // Grande para 1 brand en móvil
      if (count === 2) return "w-38 h-38"; // Mediano para 2 brands en móvil
      if (count === 3) return "w-32 h-32"; // Mediano-pequeño para 3 brands en móvil
      if (count === 4) return "w-28 h-28"; // Pequeño para 4 brands en móvil
      return "w-24 h-24"; // Más pequeño para 5+ brands en móvil
    }
    
    // Tamaños para pantallas grandes (>= 768px)
    if (count === 1) return "w-74 h-74"; // Grande para 1 brand
    if (count === 2) return "w-64 h-64"; // Mediano para 2 brands
    if (count === 3) return "w-40 h-40"; // Mediano-pequeño para 3 brands
    if (count === 4) return "w-36 h-36"; // Pequeño para 4 brands
    return "w-32 h-32"; // Más pequeño para 5+ brands
  };

  return (
    <div
      className="mt-10 relative min-h-[100svh] w-full overflow-hidden"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Background Image */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: `url('${event.bgImage || "/images/placeholder.png"}')`,
        }}
        aria-hidden
      />

      <div className="mx-auto flex min-h-[100svh] max-w-[980px] flex-col items-center justify-center px-4 sm:px-6 md:px-8">
        {/* Top Logo */}
        <div  className={`
    relative z-5 flex-shrink-0
    flex justify-center items-center
    pt-[max(1.5rem,env(safe-area-inset-top))]
    pb-2 sm:pb-3 md:pb-4
  `}>
          <div className="w-[70vw] max-w-[380px]">
            {event.logoTop && (
              <img
                src={event.logoTop}
                alt={event.name}
                className="w-full select-none"
                draggable={false}
              />
            )}
          </div>
        </div>

        {/* Title */}
        {/* <h1 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl md:text-4xl font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] tracking-wide uppercase bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent animate-pulse">
          {event.name}
        </h1> */}

        {/* Selection Panels - Centered and Scrollable */}
        <div className="flex-1 w-full max-w-2xl flex items-center justify-center">
          {/* Brand Selection */}
          <div className="w-full">
            <h2 className="text-center text-sm sm:text-base font-semibold text-white mb-4 drop-shadow">
              
            </h2>
            {loadingPrompts ? (
              <div className="text-center text-white">Cargando marcas...</div>
            ) : prompts.length > 0 ? (
              <div className={`grid gap-3 px-4 ${getGridClass()}`}>
                {prompts.map((prompt) => {
                  const imgSrc = prompt.imageUrl || prompt.logoPath;
                  const isLoading = imageLoadingStates[prompt.id];
                  const hasError = imageErrorStates[prompt.id];
                  const showDefaultImage = !imgSrc || hasError;
                  const displayName = prompt.brandName || prompt.brand || "Opción";

                  return (
                    <div key={prompt.id} className="flex flex-col gap-2 justify-center items-center">


                      {/* Brand Image Button */}
                      <button
                        onClick={() => setSelectedBrand(prompt.id)}
                        className={`relative rounded-lg font-semibold transition-all overflow-hidden flex items-center justify-center ${getCardSizeClass()} ${selectedBrand === prompt.id
                            ? "ring-4 ring-blue-400 scale-105"
                            : "hover:scale-105 opacity-85 hover:opacity-100"
                          }`}
                      >
                        {/* Loading Spinner */}
                        {isLoading && imgSrc && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                          </div>
                        )}

                        {/* Brand Name - Siempre visible */}
                        <div className="absolute bottom-2 left-2 z-20">
                          <span className="text-white text-sm font-semibold drop-shadow-lg">
                            {displayName}
                          </span>
                        </div>

                        {/* Imagen */}
                        {imgSrc && !hasError && (
                          <img
                            src={imgSrc}
                            alt={prompt.brand || "Opción"}
                            className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'
                              }`}
                            onLoad={() => handleImageLoad(prompt.id)}
                            onError={() => handleImageError(prompt.id)}
                          />
                        )}

                        {/* Vista por defecto */}
                        {showDefaultImage && !isLoading && (
                          <div className={`${event.buttonImage ? "bg-black/40" : "bg-white/20"
                            } w-full h-full flex items-center justify-center`}>
                            <span className="text-white text-xs text-center px-2 font-semibold drop-shadow">
                              {displayName}
                            </span>
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-white">No hay marcas disponibles</div>
            )}
          </div>
        </div>

        {/* Start Button */}
        <div className="mb-5 sm:mb-16 md:mb-20 flex flex-col items-center gap-4 px-4">
          {/* Data Processing Checkbox */}
          {event.dataProcessingText && (
            <div className="bg-white/90 backdrop-blur-sm rounded-lg p-4 max-w-md w-full shadow-lg">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="dataProcessing"
                  checked={dataProcessingAccepted}
                  onChange={(e) => setDataProcessingAccepted(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                />
                <label
                  htmlFor="dataProcessing"
                  className="text-sm text-gray-700 cursor-pointer select-none"
                >
                  {event.dataProcessingText}
                </label>
              </div>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStart}
            disabled={!isStartEnabled}
            className={`px-12 py-4 text-white font-semibold rounded-lg transition-all duration-200 text-base sm:text-lg ${
              isStartEnabled
                ? "active:scale-95 cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
            style={
              event.buttonImage
                ? {
                    backgroundImage: `url('${event.buttonImage}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : {
                    backgroundColor: "rgba(255, 255, 255, 0.3)",
                  }
            }
          >
            {event.buttonImage && (
              <span className="block drop-shadow-lg font-bold">Comenzar</span>
            )}
            {!event.buttonImage && "Comenzar"}
          </button>
        </div>

        {/* Bottom Logo */}
        <div className="mt-auto flex-shrink-0 w-full pb-6 sm:pb-8 md:pb-10">
          <div className="mx-auto w-full max-w-[550px] flex flex-col items-center gap-2">
            {event.logoBottom && (
              <img
                src={event.logoBottom}
                alt="Logo Inferior"
                className="w-full select-none"
                draggable={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
