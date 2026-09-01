/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import {
  getPhotoBoothPromptsByIds,
  type PhotoBoothPrompt,
} from "@/app/services/photo-booth/brandService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";
import TopLogosBar from "@/app/components/photo-booth/TopLogosBar";

export default function EventPhotoBoothLanding({
  event,
  onStart,
  buttonLabel = "Comenzar",
  readOnly = false,
  selectedBrandOverride = null,
  wide = false,
  bgVideoUrl,
}: {
  event: EventProfile;
  onStart?: (brand?: string, dataProcessingAccepted?: boolean) => void;
  /** Texto del botón principal. Por defecto "Comenzar"; se puede cambiar,
   * ej. cuando esta pantalla se usa después de tomar la foto (captura
   * primero) y el botón dispara la generación en vez de arrancar el flujo. */
  buttonLabel?: string;
  /** Modo espejo (BoothMirror): sin interacción propia, solo refleja el
   * estado del tab líder — tarjetas y checkbox/CTA quedan inertes. */
  readOnly?: boolean;
  /** Fuerza qué tarjeta aparece seleccionada (modo espejo), en vez de la
   * selección local por defecto (primera marca al cargar). */
  selectedBrandOverride?: string | null;
  /** Relaja los topes de ancho (pensados para tablet/celular, ej.
   * max-w-[1200px]) para aprovechar una pantalla gigante 1920x1080 en vez de
   * quedar como una columna angosta centrada con barras vacías a los
   * costados. Off por defecto (comportamiento original en la tablet). */
  wide?: boolean;
  /** Video de fondo (ej. el del salvapantallas del evento) en vez de
   * `event.bgImage` — usado por BoothMirror. */
  bgVideoUrl?: string | null;
}) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PhotoBoothPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [imageLoadingStates, setImageLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const [imageErrorStates, setImageErrorStates] = useState<
    Record<string, boolean>
  >({});
  const [dataProcessingAccepted, setDataProcessingAccepted] = useState(false);

  // Cargar los prompts completos usando los IDs del evento
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setLoadingPrompts(true);
        if (event.prompts && event.prompts.length > 0) {
          const loadedPrompts = await getPhotoBoothPromptsByIds(event.prompts);
          setPrompts(loadedPrompts);

          // Seleccionar automáticamente la primera brand — salvo que venga
          // una selección forzada desde afuera (modo espejo).
          if (loadedPrompts.length > 0 && !selectedBrandOverride) {
            setSelectedBrand(loadedPrompts[0].id);
          }

          // Inicializar estados de carga para cada imagen
          const initialLoadingStates: Record<string, boolean> = {};
          loadedPrompts.forEach((prompt) => {
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

  // Modo espejo: si la selección forzada cambia después del montaje (el
  // líder eligió otra marca), seguirla.
  useEffect(() => {
    if (selectedBrandOverride) setSelectedBrand(selectedBrandOverride);
  }, [selectedBrandOverride]);

  const handleImageLoad = (promptId: string) => {
    setImageLoadingStates((prev) => ({ ...prev, [promptId]: false }));
  };

  const handleImageError = (promptId: string) => {
    setImageLoadingStates((prev) => ({ ...prev, [promptId]: false }));
    setImageErrorStates((prev) => ({ ...prev, [promptId]: true }));
  };

  const handleStart = () => {
    const brand =
      selectedBrand || (prompts.length > 0 ? prompts[0].id : "default");
    onStart?.(brand, dataProcessingAccepted);
  };

  // Determinar si el botón debe estar habilitado
  const isStartEnabled = !event.dataProcessingText || dataProcessingAccepted;

  // Grid fijo de 2 columnas (2 filtros por fila) sin importar la cantidad de
  // brands, para que las tarjetas se vean más grandes; si no entran todas en
  // pantalla, el contenedor de abajo hace scroll vertical en vez de achicar
  // las tarjetas o agregar más columnas. Con una sola opción se usa 1
  // columna centrada (caso raro: esta pantalla solo se muestra cuando hay
  // más de una brand para elegir).
  const getGridClass = () => {
    if (prompts.length === 1) {
      return wide ? "grid-cols-1 max-w-[min(38vw,28rem)]" : "grid-cols-1 max-w-[min(70vw,28rem)]";
    }
    // En espejo (`wide`) las tarjetas van más chicas y el contenedor recorta
    // lo que sobre (overflow-hidden), en vez de crecer/scrollear.
    // En tablet, el tope en rem (antes 46rem/736px) se quedaba corto en
    // dispositivos verticales anchos (ej. 1080px): dejaba ~300px de margen
    // sin usar a los costados y las tarjetas se veían chicas — 62rem/992px
    // deja que aprovechen casi todo el ancho en esos equipos sin desbordar
    // en tablets angostas (ahí sigue mandando el 96vw).
    return wide ? "grid-cols-2 max-w-[min(58vw,52rem)]" : "grid-cols-2 max-w-[min(96vw,62rem)]";
  };

  return (
    <div
      className="relative h-[100svh] w-full overflow-hidden"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Background: video (ej. salvapantallas del evento) si se pasó, si no la imagen de siempre */}
      {bgVideoUrl ? (
        <video
          key={bgVideoUrl}
          src={bgVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="fixed inset-0 -z-10 w-full h-full object-cover"
          aria-hidden
        />
      ) : (
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center"
          style={{
            backgroundImage: `url('${event.bgImage || "/images/placeholder.png"}')`,
          }}
          aria-hidden
        />
      )}

      <div className={`mx-auto flex h-full ${wide ? "max-w-[1850px]" : "max-w-[1200px]"} flex-col items-center justify-center px-4 sm:px-6 md:px-8`}>
        {/* Logos: uno a cada lado (o centrado si solo hay uno), buen tamaño */}
        <TopLogosBar
          event={event}
          wide={wide}
          className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 sm:pb-3 md:pb-4"
        />

        {/* Title */}
        {/* <h1 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl md:text-4xl font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] tracking-wide uppercase bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent animate-pulse">
          {event.name}
        </h1> */}

        {/* Selection Panels - Centered and Scrollable. `min-h-0` es necesario
            para que, dentro del flex-col de altura fija de arriba, este
            `flex-1` pueda encogerse a su espacio disponible en vez de crecer
            con el contenido — sin eso `overflow-y-auto` nunca llega a
            activarse aunque el grid (2 columnas fijas) no entre completo. */}
        <div className={`flex-1 w-full min-h-0 flex items-center justify-center py-4 ${wide ? "overflow-hidden" : "overflow-y-auto"}`}>
          {/* Brand Selection */}
          <div className="w-full flex flex-col items-center">
            {loadingPrompts ? (
              <div className="text-center text-white text-base sm:text-lg">
                Cargando marcas...
              </div>
            ) : prompts.length > 0 ? (
              <div
                className={`grid gap-5 sm:gap-6 md:gap-7 w-full mx-auto ${getGridClass()}`}
              >
                {prompts.map((prompt) => {
                  const imgSrc = prompt.imageUrl || prompt.logoPath;
                  const isLoading = imageLoadingStates[prompt.id];
                  const hasError = imageErrorStates[prompt.id];
                  const showDefaultImage = !imgSrc || hasError;
                  const displayName =
                    prompt.brandName || prompt.brand || "Opción";
                  const isSelected = selectedBrand === prompt.id;

                  return (
                    <button
                      key={prompt.id}
                      onClick={readOnly ? undefined : () => setSelectedBrand(prompt.id)}
                      disabled={readOnly}
                      className={`relative w-full ${wide ? "aspect-[16/9]" : "aspect-square"} rounded-2xl font-semibold transition-all duration-200 overflow-hidden flex items-center justify-center shadow-lg shadow-black/30 ${
                        readOnly ? "cursor-default" : ""
                      } ${
                        isSelected
                          ? "ring-4 ring-blue-400 scale-[1.04]"
                          : "ring-1 ring-white/20 hover:scale-[1.02] opacity-90 hover:opacity-100"
                      }`}
                    >
                      {/* Loading Spinner */}
                      {isLoading && imgSrc && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                        </div>
                      )}

                      {/* Imagen — en `wide` se estira (object-fill) en vez de
                          recortar (object-cover): la mayoría de estas fotos
                          son verticales, y recortarlas dentro de la tarjeta
                          16:9 dejaba ver solo una tira angosta del centro;
                          estirarlas muestra la imagen completa, aunque se
                          deforme un poco - mismo criterio que /display. */}
                      {imgSrc && !hasError && (
                        <img
                          src={imgSrc}
                          alt={prompt.brand || "Opción"}
                          className={`w-full h-full transition-opacity duration-300 ${wide ? "object-fill" : "object-cover"} ${
                            isLoading ? "opacity-0" : "opacity-100"
                          }`}
                          onLoad={() => handleImageLoad(prompt.id)}
                          onError={() => handleImageError(prompt.id)}
                        />
                      )}

                      {/* Vista por defecto */}
                      {showDefaultImage && !isLoading && (
                        <div
                          className={`${
                            event.buttonImage ? "bg-black/40" : "bg-white/20"
                          } w-full h-full flex items-center justify-center`}
                        >
                          <span className="text-white text-sm sm:text-base text-center px-2 font-semibold drop-shadow">
                            {displayName}
                          </span>
                        </div>
                      )}

                      {/* Scrim inferior + nombre de la marca - siempre visible */}
                      <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-2 sm:px-3 ${wide ? "pt-10 pb-3 sm:pb-4" : "pt-8 pb-2 sm:pb-3"}`}>
                        <span className={`block text-white font-bold leading-tight drop-shadow-lg ${wide ? "text-2xl md:text-3xl" : "text-base sm:text-lg md:text-xl"}`}>
                          {displayName}
                        </span>
                      </div>

                      {/* Check de seleccionado */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-20 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                          <svg
                            viewBox="0 0 20 20"
                            className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"
                            fill="none"
                          >
                            <path
                              d="M4 10.5L8 14.5L16 5.5"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-white text-base sm:text-lg">
                No hay marcas disponibles
              </div>
            )}
          </div>
        </div>

        {/* Start Button - último elemento, con espacio propio hasta el borde */}
        <div className="mt-auto flex-shrink-0 w-full flex flex-col items-center gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-8 md:pb-10">
          {/* Data Processing Checkbox */}
          {event.dataProcessingText && (
            <div className="bg-white/90 backdrop-blur-sm rounded-lg p-4 max-w-md w-full shadow-lg">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="dataProcessing"
                  checked={dataProcessingAccepted}
                  disabled={readOnly}
                  onChange={readOnly ? undefined : (e) => setDataProcessingAccepted(e.target.checked)}
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
          <ButtonPrimary
            onClick={readOnly ? undefined : handleStart}
            disabled={readOnly || !isStartEnabled}
            label={buttonLabel}
            imageSrc={event.buttonImage}
            colorFrom={event.splashButtonColorFrom}
            colorTo={event.splashButtonColorTo}
            clickEffect={event.buttonClickEffect}
            width={wide ? "55%" : "80%"}
            height={wide ? "clamp(84px, 12vh, 150px)" : "clamp(52px, 8.5vh, 84px)"}
            textClassName={wide ? undefined : "text-lg sm:text-xl md:text-2xl"}
            textStyle={
              wide
                ? { fontSize: "clamp(2.6rem, 4.4vw, 4.6rem)", letterSpacing: "0.04em" }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
