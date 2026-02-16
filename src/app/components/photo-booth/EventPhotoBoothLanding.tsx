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
  onStart?: (brand?: string) => void;
}) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PhotoBoothPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);

  // Cargar los prompts completos usando los IDs del evento
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setLoadingPrompts(true);
        if (event.prompts && event.prompts.length > 0) {
          const loadedPrompts = await getPhotoBoothPromptsByIds(event.prompts);
          setPrompts(loadedPrompts);
        }
      } catch (error) {
        // Error loading prompts
      } finally {
        setLoadingPrompts(false);
      }
    };

    loadPrompts();
  }, [event.prompts]);

  const handleStart = () => {
    const brand = selectedBrand || (prompts.length > 0 ? prompts[0].id : "default");
    onStart?.(brand);
  };

  return (
    <div
      className="relative min-h-[100svh] w-full overflow-hidden"
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

      <div className="mx-auto flex min-h-[100svh] max-w-[980px] flex-col items-center px-4 sm:px-6 md:px-8">
        {/* Top Logo */}
        <div className="w-full pt-3 sm:pt-4 md:pt-6">
          <div className="mx-auto w-full max-w-[620px] flex flex-col items-center gap-2">
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
        <h1 className="mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-xl font-semibold text-white drop-shadow-md">
          {event.name}
        </h1>

        {/* Selection Panels - Centered and Scrollable */}
        <div className="mt-8 sm:mt-12 w-full max-w-2xl flex-1 overflow-y-auto">
          {/* Brand Selection */}
          <div className="mb-8">
            <h2 className="text-center text-sm sm:text-base font-semibold text-white mb-4 drop-shadow">
              Selecciona tu Marca / Prompt
            </h2>
            {loadingPrompts ? (
              <div className="text-center text-white">Cargando marcas...</div>
            ) : prompts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
                {prompts.map((prompt) => {
                  const imgSrc = prompt.imageUrl || prompt.logoPath;
                  return (
                    <button
                      key={prompt.id}
                      onClick={() => setSelectedBrand(prompt.id)}
                      className={`relative rounded-lg font-semibold transition-all overflow-hidden h-24 flex items-center justify-center ${
                        selectedBrand === prompt.id
                          ? "ring-4 ring-yellow-400 scale-105"
                          : "hover:scale-105 opacity-85 hover:opacity-100"
                      }`}
                      style={
                        event.buttonImage
                          ? {
                              backgroundImage: `url('${event.buttonImage}')`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : {}
                      }
                    >
                      {imgSrc ? (
                        <img
                          src={ imgSrc}
                          alt={prompt.brand || "Opción"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className={`${event.buttonImage ? "bg-black/40" : "bg-white/20"} w-full h-full flex items-center justify-center`}>
                          <span className="text-white text-xs text-center px-2 font-semibold drop-shadow">
                            {prompt.brand || "Opción"}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-white">No hay marcas disponibles</div>
            )}
          </div>
        </div>

        {/* Start Button */}
        <div className="mb-12 sm:mb-16 md:mb-20">
          <button
            onClick={handleStart}
            className="px-12 py-4 text-white font-semibold rounded-lg transition-all duration-200 active:scale-95 text-base sm:text-lg"
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
          <div className="mx-auto w-full max-w-[400px] flex flex-col items-center gap-2">
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
