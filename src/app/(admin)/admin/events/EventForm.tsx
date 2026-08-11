"use client";

import React, { useState, useEffect } from "react";
import {
  EventProfile,
  createEventProfile,
  updateEventProfile,
} from "@/app/services/photo-booth/eventService";
import { getActivePhotoBoothPrompts, type PhotoBoothPrompt } from "@/app/services/photo-booth/brandService";
import { BUTTON_CLICK_EFFECT_OPTIONS } from "@/app/components/common/click-effects";
import ImageUploadField from "./ImageUploadField";
import VideoUploadField from "./VideoUploadField";

export default function EventForm({
  event,
  onClose,
  onSave,
}: {
  event: EventProfile | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [availablePrompts, setAvailablePrompts] = useState<PhotoBoothPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [formData, setFormData] = useState<Partial<EventProfile>>({
    name: event?.name || "",
    slug: event?.slug || "",
    description: event?.description || "",
    bgImage: event?.bgImage || "",
    logoTop: event?.logoTop || "",
    logoBottom: event?.logoBottom || "",
    frameImage: event?.frameImage || "",
    buttonImage: event?.buttonImage || "",
    loadingPageImage: event?.loadingPageImage || "",
    splashImage: event?.splashImage || "",
    screenSaverVideoUrl: event?.screenSaverVideoUrl || "",
    loadingMessage: event?.loadingMessage || "Generando imagen",
    showLogosInLoader: event?.showLogosInLoader !== false,
    enableFrame: event?.enableFrame !== false,
    dataProcessingText: event?.dataProcessingText || "",
    generationType: event?.generationType || "IMAGE",
    buttonClickEffect: event?.buttonClickEffect || "NONE",
    handCursorEnabled: event?.handCursorEnabled === true,
    revealEffect: event?.revealEffect || "HAND_WIPE",
    showSplashScreen: event?.showSplashScreen === true,
    captureBeforeFilter: event?.captureBeforeFilter === true,
    captureViewStyle: event?.captureViewStyle || "CLASSIC",
    imageCustomizationEnabled: event?.imageCustomizationEnabled === true,
    prompts: event?.prompts || [],
    isActive: event?.isActive !== false,
  });

  const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>(event?.prompts || []);

  // Load available prompts
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setLoadingPrompts(true);
        const data = await getActivePhotoBoothPrompts(100);
        setAvailablePrompts(data.data);
      } catch (error) {
        console.error("Error loading prompts:", error);
      } finally {
        setLoadingPrompts(false);
      }
    };

    loadPrompts();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleImageChange = (field: string, value: string) => {
    setFormData((prev) => {
      // Evitar actualización si el valor no ha cambiado
      if (prev[field as keyof typeof prev] === value) {
        return prev;
      }
      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleAddPrompt = (promptId: string) => {
    if (!selectedPromptIds.includes(promptId)) {
      setSelectedPromptIds([...selectedPromptIds, promptId]);
    }
  };

  const handleRemovePrompt = (promptId: string) => {
    setSelectedPromptIds(selectedPromptIds.filter((id) => id !== promptId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.slug?.trim()) {
      alert("Nombre y Slug son requeridos");
      return;
    }

    try {
      setLoading(true);
      const eventData = {
        ...formData,
        prompts: selectedPromptIds,
      };

      if (event?.id) {
        await updateEventProfile(event.id, eventData);
      } else {
        await createEventProfile(eventData);
      }

      onSave();
      onClose();
    } catch (error) {
      console.error("Error saving event:", error);
      alert("Error al guardar el evento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-bold">
          {event ? "Editar Evento" : "Crear Evento"}
        </h1>
        <button
          onClick={onClose}
          className="w-full sm:w-auto px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm sm:text-base"
        >
          Volver
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-md p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-6"
      >
        {/* Basic Info */}
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-semibold">Información Básica</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Nombre del Evento *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name || ""}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Slug (URL) *
              </label>
              <input
                type="text"
                name="slug"
                value={formData.slug || ""}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ej: fenalco, congresoEdu"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              name="description"
              value={formData.description || ""}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Tratamiento de Datos
            </label>
            <textarea
              name="dataProcessingText"
              value={formData.dataProcessingText || ""}
              onChange={handleChange}
              rows={5}
              placeholder="Ingrese el texto sobre el tratamiento de datos personales..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Texto informativo sobre el tratamiento de datos personales para este evento
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              name="isActive"
              checked={formData.isActive !== false}
              onChange={handleChange}
              className="h-4 w-4 border-gray-300 rounded cursor-pointer"
            />
            <label className="ml-2 text-xs sm:text-sm font-medium text-gray-700 cursor-pointer">
              Evento Activo
            </label>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Tipo de Generación
            </label>
            <select
              name="generationType"
              value={formData.generationType || "IMAGE"}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, generationType: e.target.value as "IMAGE" | "BGVIDEO" | "VIDEO" }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="IMAGE">IMAGE</option>
              <option value="BGVIDEO">BGVIDEO</option>
              <option value="VIDEO">VIDEO</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Efecto al Tocar Botones
            </label>
            <select
              name="buttonClickEffect"
              value={formData.buttonClickEffect || "NONE"}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  buttonClickEffect: e.target.value as "NONE" | "CONFETTI" | "PAINT_SPLASH",
                }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {BUTTON_CLICK_EFFECT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Animación que se dispara al tocar los botones (tomar foto, repetir, confirmar, etc.) en este evento.
            </p>
          </div>
        </div>

        {/* Images */}
        <div className="space-y-4 border-t pt-4 sm:pt-6">
          <h2 className="text-base sm:text-lg font-semibold">Imágenes</h2>

          <ImageUploadField
            label="Imagen de Fondo"
            value={formData.bgImage || ""}
            onChange={(value) => handleImageChange("bgImage", value)}
          />

          <ImageUploadField
            label="Logo Superior"
            value={formData.logoTop || ""}
            onChange={(value) => handleImageChange("logoTop", value)}
          />

          <ImageUploadField
            label="Logo Inferior"
            value={formData.logoBottom || ""}
            onChange={(value) => handleImageChange("logoBottom", value)}
          />

          <ImageUploadField
            label="Marco de Foto"
            value={formData.frameImage || ""}
            onChange={(value) => handleImageChange("frameImage", value)}
          />

          <ImageUploadField
            label="Imagen de Botones"
            value={formData.buttonImage || ""}
            onChange={(value) => handleImageChange("buttonImage", value)}
          />

          <ImageUploadField
            label="Imagen de Pantalla de Carga (Loading Page)"
            value={formData.loadingPageImage || ""}
            onChange={(value) => handleImageChange("loadingPageImage", value)}
          />

          <ImageUploadField
            label="Imagen Splash (Pantalla de Inicio)"
            value={formData.splashImage || ""}
            onChange={(value) => handleImageChange("splashImage", value)}
          />
          <p className="text-xs text-gray-500 -mt-2">
            También se usa como fondo de la pantalla de inactividad (screensaver) si no hay video configurado abajo.
          </p>

          <VideoUploadField
            label="Video Splash - Pantalla de Inactividad (loop, opcional)"
            value={formData.screenSaverVideoUrl || ""}
            onChange={(value) => handleImageChange("screenSaverVideoUrl", value)}
          />
          <p className="text-xs text-gray-500 -mt-2">
            Si se sube un video, la pantalla de inactividad lo reproduce en loop en vez de la imagen splash de arriba.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensaje de Pantalla de Carga
            </label>
            <input
              type="text"
              name="loadingMessage"
              value={formData.loadingMessage || ""}
              onChange={handleChange}
              placeholder="Ej: Generando imagen"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              Si no se especifica, mostrará &quot;Generando imagen&quot;
            </p>
          </div>

          {/* LoaderStep Configuration */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="showLogosInLoader"
                name="showLogosInLoader"
                checked={formData.showLogosInLoader !== false}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    showLogosInLoader: e.target.checked,
                  }));
                }}
                className="h-4 w-4 border-gray-300 rounded"
              />
              <label
                htmlFor="showLogosInLoader"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Mostrar logos en pantalla de carga (LoaderStep)
              </label>
            </div>
            <p className="text-xs text-gray-600">
              Si está activado, se mostrarán los logos superior e inferior en la pantalla de carga.
              Si está desactivado, solo se mostrará el mensaje de carga.
            </p>
          </div>

          {/* Frame Configuration */}
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="enableFrame"
                name="enableFrame"
                checked={formData.enableFrame !== false}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    enableFrame: e.target.checked,
                  }));
                }}
                className="h-4 w-4 border-gray-300 rounded"
              />
              <label
                htmlFor="enableFrame"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Habilitar marco en resultados
              </label>
            </div>
            <p className="text-xs text-gray-600">
              Si está activado, se mostrará el marco de foto sobre la imagen generada en la pantalla de resultados.
            </p>
          </div>

          {/* Hand Cursor Configuration */}
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="handCursorEnabled"
                name="handCursorEnabled"
                checked={formData.handCursorEnabled === true}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    handCursorEnabled: e.target.checked,
                  }));
                }}
                className="h-4 w-4 border-gray-300 rounded"
              />
              <label
                htmlFor="handCursorEnabled"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Controlar la app con un cursor de mano (sin tocar la pantalla)
              </label>
            </div>
            <p className="text-xs text-gray-600">
              Si está activado, se usa una cámara en segundo plano para detectar la mano y mover un cursor en pantalla;
              juntar el pulgar y el índice (pellizco) simula un click. Útil para kioscos sin contacto.
            </p>
          </div>

          {/* Reveal Effect Configuration */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Efecto de Revelado de la Foto
            </label>
            <select
              name="revealEffect"
              value={formData.revealEffect || "HAND_WIPE"}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  revealEffect: e.target.value as "NONE" | "HAND_WIPE" | "ROLLER" | "ROLLER_COLOR",
                }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="NONE">Sin efecto (pasa directo al resultado)</option>
              <option value="HAND_WIPE">Borrar el velo con la mano</option>
              <option value="ROLLER">Rodillo de pintura (descubre la foto)</option>
              <option value="ROLLER_COLOR">Rodillo: blanco y negro a color</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Cómo se revela la foto generada antes de mostrar el resultado final. Con &quot;Rodillo&quot; basta con
              pasar la mano (o el dedo, si no hay cámara) sobre la foto. &quot;Blanco y negro a color&quot; usa el mismo
              rodillo pero arranca la foto en blanco y negro y va pintando el color al pasarlo.
            </p>
          </div>

          {/* Splash Screen Configuration */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="showSplashScreen"
                name="showSplashScreen"
                checked={formData.showSplashScreen === true}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    showSplashScreen: e.target.checked,
                  }));
                }}
                className="h-4 w-4 border-gray-300 rounded"
              />
              <label
                htmlFor="showSplashScreen"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Mostrar pantalla de splash inicial con botón &quot;Comenzar&quot;
              </label>
            </div>
            <p className="text-xs text-gray-600">
              Si está activado, antes de la selección de marca/foto se muestra una pantalla con la &quot;Imagen Splash
              (Pantalla de Inicio)&quot; de arriba y un botón para arrancar el evento.
            </p>
          </div>

          {/* Flow Order Configuration */}
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="captureBeforeFilter"
                name="captureBeforeFilter"
                checked={formData.captureBeforeFilter === true}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    captureBeforeFilter: e.target.checked,
                  }));
                }}
                className="h-4 w-4 border-gray-300 rounded"
              />
              <label
                htmlFor="captureBeforeFilter"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Tomar la foto primero, elegir filtro/marca después
              </label>
            </div>
            <p className="text-xs text-gray-600">
              Por defecto se elige primero el filtro/marca y después se toma la foto. Si está activado, se invierte: se
              toma la foto, se confirma, y recién ahí aparece la selección de filtro/marca (con el tratamiento de
              datos si aplica), antes de generar el resultado.
            </p>
          </div>

          {/* Capture View Style Configuration */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Estilo de la Pantalla de Captura
            </label>
            <select
              name="captureViewStyle"
              value={formData.captureViewStyle || "CLASSIC"}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  captureViewStyle: e.target.value as "CLASSIC" | "VIEWFINDER",
                }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="CLASSIC">Clásica (actual)</option>
              <option value="VIEWFINDER">Visor con guía (grilla, esquinas y silueta de rostro)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              &quot;Visor con guía&quot; agrega una grilla de tercios, esquinas de encuadre y una silueta de rostro
              sobre la vista de la cámara, para ayudar a ubicarse antes de la foto.
            </p>
          </div>

          {/* Image Customization Configuration */}
          <div className="bg-pink-50 rounded-lg p-4 border border-pink-200">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="imageCustomizationEnabled"
                name="imageCustomizationEnabled"
                checked={formData.imageCustomizationEnabled === true}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    imageCustomizationEnabled: e.target.checked,
                  }));
                }}
                className="h-4 w-4 border-gray-300 rounded"
              />
              <label
                htmlFor="imageCustomizationEnabled"
                className="ml-2 text-sm font-medium text-gray-700"
              >
                Habilitar pantalla &quot;Dale tu toque&quot; (paleta, textura e intensidad)
              </label>
            </div>
            <p className="text-xs text-gray-600">
              Si está activado, después de confirmar la foto (y antes de generar) aparece una pantalla para elegir un
              color de paleta, una textura y una intensidad. Esas elecciones se guardan en la tarea y se agregan al
              prompt de IA.
            </p>
          </div>
        </div>

        {/* Prompts */}
        <div className="space-y-4 border-t pt-6">
          <h2 className="text-lg font-semibold">Prompts</h2>

          {loadingPrompts ? (
            <p className="text-gray-600">Cargando prompts disponibles...</p>
          ) : availablePrompts.length === 0 ? (
            <p className="text-gray-600">No hay prompts disponibles</p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar Prompts
                </label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddPrompt(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Selecciona un prompt...</option>
                  {availablePrompts.map((prompt) => (
                    <option
                      key={prompt.id}
                      value={prompt.id}
                      disabled={selectedPromptIds.includes(prompt.id)}
                    >
                      {prompt.brand} - {prompt.basePrompt}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPromptIds.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prompts Seleccionados ({selectedPromptIds.length})
                  </label>
                  <ul className="space-y-2">
                    {selectedPromptIds.map((promptId) => {
                      const prompt = availablePrompts.find((p) => p.id === promptId);
                      return (
                        <li
                          key={promptId}
                          className="flex items-center justify-between bg-gray-50 p-3 rounded border border-gray-200"
                        >
                          <span className="text-gray-700">
                            <strong>{prompt?.brand}:</strong> {prompt?.basePrompt}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePrompt(promptId)}
                            className="text-red-600 hover:text-red-700 font-medium text-sm"
                          >
                            Eliminar
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex gap-3 border-t pt-6">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400"
          >
            {loading ? "Guardando..." : "Guardar Evento"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
