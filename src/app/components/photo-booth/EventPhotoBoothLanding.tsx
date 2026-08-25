/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import {
  getPhotoBoothPromptsByIds,
  type PhotoBoothPrompt,
} from "@/app/services/photo-booth/brandService";
import ButtonPrimary from "@/app/components/common/ButtonPrimary";

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
   * max-w-[980px]) para aprovechar una pantalla gigante 1920x1080 en vez de
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

  // Determina columnas y ancho máximo del grid según la cantidad de brands.
  // Las cards ya no tienen tamaño fijo en px: ocupan el 100% de su celda de
  // grid (aspect-square), así que crecen o encogen con la pantalla. El
  // max-width por cantidad solo evita que 1-2 opciones queden gigantes en
  // pantallas anchas (kiosco/tablet).
  const getGridClass = () => {
    const count = prompts.length;
    // En modo `wide` (pantalla gigante), los mismos topes en rem quedarían
    // chicos para 1920px — se relajan (~1.7x) para que las tarjetas usen
    // más del ancho disponible en vez de quedar agrupadas en el centro.
    if (count === 1) return wide ? "grid-cols-1 max-w-[min(60vw,34rem)]" : "grid-cols-1 max-w-[min(60vw,20rem)]";
    if (count === 2) return wide ? "grid-cols-2 max-w-[min(80vw,54rem)]" : "grid-cols-2 max-w-[min(80vw,32rem)]";
    if (count === 3) return wide ? "grid-cols-3 max-w-[min(90vw,68rem)]" : "grid-cols-3 max-w-[min(90vw,40rem)]";
    if (count === 4) return wide ? "grid-cols-2 sm:grid-cols-4 max-w-[min(90vw,75rem)]" : "grid-cols-2 sm:grid-cols-4 max-w-[min(90vw,44rem)]";
    return wide
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-w-[min(95vw,95rem)]"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-w-[min(95vw,56rem)]";
  };

  return (
    <div
      className="relative min-h-[100svh] w-full overflow-hidden"
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

      <div className={`mx-auto flex min-h-[100svh] ${wide ? "max-w-[1700px]" : "max-w-[980px]"} flex-col items-center justify-center px-4 sm:px-6 md:px-8`}>
        {/* Logos: uno a cada lado (o centrado si solo hay uno), buen tamaño */}
        <div
          className={`
    relative z-5 flex-shrink-0 w-full
    flex items-center gap-4
    ${event.logoTop && event.logoBottom ? "justify-between" : "justify-center"}
    pt-[max(1.5rem,env(safe-area-inset-top))]
    pb-2 sm:pb-3 md:pb-4
  `}
        >
          {event.logoTop && (
            <img
              src={event.logoTop}
              alt={event.name}
              className={`${wide ? "h-[clamp(4.5rem,15vh,8.5rem)]" : "h-[clamp(3rem,11vh,6rem)]"} w-auto max-w-[42vw] object-contain select-none`}
              draggable={false}
            />
          )}
          {event.logoBottom && (
            <img
              src={event.logoBottom}
              alt=""
              className={`${wide ? "h-[clamp(4.5rem,15vh,8.5rem)]" : "h-[clamp(3rem,11vh,6rem)]"} w-auto max-w-[42vw] object-contain select-none`}
              draggable={false}
            />
          )}
        </div>

        {/* Title */}
        {/* <h1 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl md:text-4xl font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] tracking-wide uppercase bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent animate-pulse">
          {event.name}
        </h1> */}

        {/* Selection Panels - Centered and Scrollable */}
        <div className="flex-1 w-full flex items-center justify-center py-4">
          {/* Brand Selection */}
          <div className="w-full flex flex-col items-center">
            {loadingPrompts ? (
              <div className="text-center text-white text-base sm:text-lg">
                Cargando marcas...
              </div>
            ) : prompts.length > 0 ? (
              <div
                className={`grid gap-4 sm:gap-5 md:gap-6 w-full mx-auto ${getGridClass()}`}
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
                      className={`relative w-full ${wide ? "aspect-[4/3]" : "aspect-square"} rounded-2xl font-semibold transition-all duration-200 overflow-hidden flex items-center justify-center shadow-lg shadow-black/30 ${
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

                      {/* Imagen */}
                      {imgSrc && !hasError && (
                        <img
                          src={imgSrc}
                          alt={prompt.brand || "Opción"}
                          className={`w-full h-full object-cover transition-opacity duration-300 ${
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
                      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/25 to-transparent pt-8 pb-2 sm:pb-3 px-2 sm:px-3">
                        <span className="block text-white text-sm sm:text-base md:text-lg font-bold leading-tight drop-shadow-lg">
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
            width="80%"
            height="clamp(52px, 8.5vh, 84px)"
            textClassName="text-lg sm:text-xl md:text-2xl"
          />
        </div>
      </div>
    </div>
  );
}
