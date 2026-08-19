"use client";

import React, { useState, useEffect, type ReactNode } from "react";
import {
  FaInfoCircle,
  FaImage,
  FaCamera,
  FaHandPaper,
  FaDesktop,
  FaRobot,
  FaChevronDown,
  FaCheckCircle,
} from "react-icons/fa";
import type { IconType } from "react-icons";
import {
  EventProfile,
  createEventProfile,
  updateEventProfile,
} from "@/app/services/photo-booth/eventService";
import { getActivePhotoBoothPrompts, type PhotoBoothPrompt } from "@/app/services/photo-booth/brandService";
import { BUTTON_CLICK_EFFECT_OPTIONS } from "@/app/components/common/click-effects";
import ImageUploadField from "./ImageUploadField";
import VideoUploadField from "./VideoUploadField";

/** Sección colapsable: agrupa campos relacionados bajo un título con ícono. */
function AccordionSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: IconType;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Icon className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-sm sm:text-base font-semibold text-gray-800">{title}</span>
        </span>
        <FaChevronDown
          className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 py-4 sm:px-5 sm:py-5 space-y-4 border-t border-gray-200 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

/** Checkbox + label + descripción, con estilo consistente para todos los toggles del form. */
function ToggleField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        checked ? "border-blue-200 bg-blue-50/50" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span>
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {description && <span className="block text-xs text-gray-500 mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

/** Label + <select> + texto de ayuda opcional, con estilo consistente. */
function SelectField({
  label,
  value,
  onChange,
  helperText,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {children}
      </select>
      {helperText && <p className="text-xs text-gray-500 mt-1">{helperText}</p>}
    </div>
  );
}

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
  // Id del evento que se está editando — empieza en el prop, pero después de
  // crear uno nuevo se actualiza acá mismo (sin depender de que el padre
  // vuelva a renderizar con otro `event`), así los guardados siguientes usan
  // updateEventProfile en vez de crear un evento duplicado.
  const [currentEventId, setCurrentEventId] = useState<string | null>(event?.id ?? null);
  const [showSaved, setShowSaved] = useState(false);
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
    loadingMediaUrl: event?.loadingMediaUrl || "",
    splashImage: event?.splashImage || "",
    screenSaverVideoUrl: event?.screenSaverVideoUrl || "",
    loadingMessage: event?.loadingMessage || "Generando imagen",
    loadingSubtitle: event?.loadingSubtitle || "",
    loadingTitleColor: event?.loadingTitleColor || "#ef4444",
    loadingSubtitleColor: event?.loadingSubtitleColor || "#1a1a1a",
    showLogosInLoader: event?.showLogosInLoader !== false,
    enableFrame: event?.enableFrame !== false,
    dataProcessingText: event?.dataProcessingText || "",
    generationType: event?.generationType || "IMAGE",
    buttonClickEffect: event?.buttonClickEffect || "NONE",
    handCursorEnabled: event?.handCursorEnabled === true,
    handRevealEnabled: event?.handRevealEnabled === true,
    revealEffect: event?.revealEffect || "HAND_WIPE",
    showSplashScreen: event?.showSplashScreen === true,
    splashTitle: event?.splashTitle || "",
    splashTitleColor: event?.splashTitleColor || "#E4032E",
    splashSubtitle: event?.splashSubtitle || "",
    splashSubtitleColor: event?.splashSubtitleColor || "#2B2118",
    splashCardImage: event?.splashCardImage || "",
    splashWord1: event?.splashWord1 || "",
    splashWord1Color: event?.splashWord1Color || "#1FB6C4",
    splashWord2: event?.splashWord2 || "",
    splashWord2Color: event?.splashWord2Color || "#F0369A",
    splashLoaderColorFrom: event?.splashLoaderColorFrom || "#F7A600",
    splashLoaderColorTo: event?.splashLoaderColorTo || "#E4032E",
    splashButtonText: event?.splashButtonText || "",
    splashButtonColorFrom: event?.splashButtonColorFrom || "#F2143C",
    splashButtonColorTo: event?.splashButtonColorTo || "#C40024",
    captureBeforeFilter: event?.captureBeforeFilter === true,
    captureViewStyle: event?.captureViewStyle || "CLASSIC",
    imageCustomizationEnabled: event?.imageCustomizationEnabled === true,
    backgroundAnimation: event?.backgroundAnimation || "NONE",
    paintTimeSeconds: event?.paintTimeSeconds,
    photoAspectRatio: event?.photoAspectRatio || "SQUARE",
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

  const setField = <K extends keyof EventProfile>(field: K, value: EventProfile[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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

      if (currentEventId) {
        await updateEventProfile(currentEventId, eventData);
      } else {
        const newId = await createEventProfile(eventData);
        setCurrentEventId(newId);
      }

      // Refresca la lista en segundo plano (para que quede al día cuando el
      // usuario vuelva), pero ya NO cierra el formulario — se queda en
      // "Editar" y solo avisa que guardó.
      onSave();
      setShowSaved(true);
      window.setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error("Error saving event:", error);
      alert("Error al guardar el evento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Aviso de guardado — fijo arriba a la derecha, no depende de scroll */}
      {showSaved && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg animate-fadeIn"
          role="status"
          aria-live="polite"
        >
          <FaCheckCircle className="w-4 h-4 flex-shrink-0" aria-hidden />
          <span className="text-sm font-medium">Evento guardado correctamente</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-bold">
          {currentEventId ? "Editar Evento" : "Crear Evento"}
        </h1>
        <button
          onClick={onClose}
          className="w-full sm:w-auto px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm sm:text-base"
        >
          Volver
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        {/* Información Básica */}
        <AccordionSection title="Información Básica" icon={FaInfoCircle} defaultOpen>
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

          <ToggleField
            id="isActive"
            label="Evento Activo"
            checked={formData.isActive !== false}
            onChange={(checked) => setField("isActive", checked)}
          />

          <SelectField
            label="Tipo de Generación"
            value={formData.generationType || "IMAGE"}
            onChange={(v) => setField("generationType", v as "IMAGE" | "BGVIDEO" | "VIDEO")}
          >
            <option value="IMAGE">IMAGE</option>
            <option value="BGVIDEO">BGVIDEO</option>
            <option value="VIDEO">VIDEO</option>
          </SelectField>
        </AccordionSection>

        {/* Imágenes y Marca */}
        <AccordionSection title="Imágenes y Marca" icon={FaImage}>
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

          <ToggleField
            id="enableFrame"
            label="Habilitar marco en resultados"
            description="Si está activado, se mostrará el marco de foto de arriba sobre la imagen generada en la pantalla de resultados."
            checked={formData.enableFrame !== false}
            onChange={(checked) => setField("enableFrame", checked)}
          />

          <ImageUploadField
            label="Imagen de Botones"
            value={formData.buttonImage || ""}
            onChange={(value) => handleImageChange("buttonImage", value)}
          />
        </AccordionSection>

        {/* Flujo de Captura */}
        <AccordionSection title="Flujo de Captura" icon={FaCamera}>
          <SelectField
            label="Relación de Aspecto de la Foto"
            value={formData.photoAspectRatio || "SQUARE"}
            onChange={(v) => setField("photoAspectRatio", v as "SQUARE" | "3:4")}
            helperText='Afecta la captura, lo enviado a la IA, el revelado, la descarga y la impresión. "3:4" es para eventos que imprimen con una Canon Selphy CP1500.'
          >
            <option value="SQUARE">Cuadrada 1:1 (actual)</option>
            <option value="3:4">3:4 (impresora Canon Selphy CP1500)</option>
          </SelectField>

          <ToggleField
            id="captureBeforeFilter"
            label="Tomar la foto primero, elegir filtro/marca después"
            description="Por defecto se elige primero el filtro/marca y después se toma la foto. Si está activado, se invierte: se toma la foto, se confirma, y recién ahí aparece la selección de filtro/marca (con el tratamiento de datos si aplica), antes de generar el resultado."
            checked={formData.captureBeforeFilter === true}
            onChange={(checked) => setField("captureBeforeFilter", checked)}
          />

          <SelectField
            label="Estilo de la Pantalla de Captura"
            value={formData.captureViewStyle || "CLASSIC"}
            onChange={(v) => setField("captureViewStyle", v as "CLASSIC" | "VIEWFINDER")}
            helperText='"Visor con guía" agrega una grilla de tercios, esquinas de encuadre y una silueta de rostro sobre la vista de la cámara, para ayudar a ubicarse antes de la foto.'
          >
            <option value="CLASSIC">Clásica (actual)</option>
            <option value="VIEWFINDER">Visor con guía (grilla, esquinas y silueta de rostro)</option>
          </SelectField>

          <ToggleField
            id="imageCustomizationEnabled"
            label='Habilitar pantalla "Dale tu toque" (paleta, textura e intensidad)'
            description="Si está activado, después de confirmar la foto (y antes de generar) aparece una pantalla para elegir un color de paleta, una textura y una intensidad. Esas elecciones se guardan en la tarea y se agregan al prompt de IA."
            checked={formData.imageCustomizationEnabled === true}
            onChange={(checked) => setField("imageCustomizationEnabled", checked)}
          />

          <SelectField
            label="Efecto al Tocar Botones"
            value={formData.buttonClickEffect || "NONE"}
            onChange={(v) => setField("buttonClickEffect", v as "NONE" | "CONFETTI" | "PAINT_SPLASH")}
            helperText="Animación que se dispara al tocar los botones (tomar foto, repetir, confirmar, etc.) en este evento."
          >
            {BUTTON_CLICK_EFFECT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </SelectField>
        </AccordionSection>

        {/* Revelado de la Foto */}
        <AccordionSection title="Revelado de la Foto" icon={FaHandPaper}>
          <SelectField
            label="Efecto de Revelado de la Foto"
            value={formData.revealEffect || "HAND_WIPE"}
            onChange={(v) =>
              setField("revealEffect", v as "NONE" | "HAND_WIPE" | "ROLLER" | "ROLLER_COLOR")
            }
            helperText='Cómo se revela la foto generada antes de mostrar el resultado final. Con "Rodillo" basta con pasar la mano (o el dedo, si no hay cámara) sobre la foto. "Blanco y negro a color" usa el mismo rodillo pero arranca la foto en blanco y negro y va pintando el color al pasarlo.'
          >
            <option value="NONE">Sin efecto (pasa directo al resultado)</option>
            <option value="HAND_WIPE">Borrar el velo con la mano</option>
            <option value="ROLLER">Rodillo de pintura (descubre la foto)</option>
            <option value="ROLLER_COLOR">Rodillo: blanco y negro a color</option>
          </SelectField>

          <ToggleField
            id="handCursorEnabled"
            label="Controlar la app con un cursor de mano (sin tocar la pantalla)"
            description="Si está activado, se usa una cámara en segundo plano para detectar la mano y mover un cursor en pantalla; juntar el pulgar y el índice (pellizco) simula un click. Útil para kioscos sin contacto."
            checked={formData.handCursorEnabled === true}
            onChange={(checked) => setField("handCursorEnabled", checked)}
          />

          <ToggleField
            id="handRevealEnabled"
            label='Usar la cámara para revelar la foto con la mano (efectos "Borrar el velo" / rodillo)'
            description="Independiente del cursor de arriba. Si está desactivado, revelar la foto se hace solo tocando/arrastrando la pantalla — recomendado si los asistentes abren el booth desde su propio celular, ya que activar la cámara ahí no encuentra una mano estable y aparece un punto flotante parpadeando. Actívalo solo para kioscos fijos con cámara apuntando a las manos."
            checked={formData.handRevealEnabled === true}
            onChange={(checked) => setField("handRevealEnabled", checked)}
          />

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Tiempo para Pintar/Revelar (segundos)
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={formData.paintTimeSeconds ?? ""}
              onChange={(e) =>
                setField(
                  "paintTimeSeconds",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
              placeholder="28 (por defecto)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Tiempo máximo que se le da a la persona para revelar la foto (borrar el velo o pintar con el rodillo) antes de avanzar solo al resultado. Vacío = 28 segundos.
            </p>
          </div>
        </AccordionSection>

        {/* Pantallas: Carga / Splash / Fondo */}
        <AccordionSection title="Pantallas (Carga / Splash / Fondo)" icon={FaDesktop}>
          <ImageUploadField
            label="Imagen de Pantalla de Carga (Loading Page)"
            value={formData.loadingPageImage || ""}
            onChange={(value) => handleImageChange("loadingPageImage", value)}
          />

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
            <div className="flex items-center gap-3 mt-2">
              <label htmlFor="loadingTitleColor" className="text-sm text-gray-700">
                Color del texto
              </label>
              <input
                type="color"
                id="loadingTitleColor"
                name="loadingTitleColor"
                value={formData.loadingTitleColor || "#ef4444"}
                onChange={handleChange}
                className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
              />
              <span className="text-xs text-gray-500">{formData.loadingTitleColor || "#ef4444"}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subtítulo de Pantalla de Carga
            </label>
            <input
              type="text"
              name="loadingSubtitle"
              value={formData.loadingSubtitle || ""}
              onChange={handleChange}
              placeholder="Ej: Estamos mezclando los colores..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              Texto más chico debajo del mensaje principal. Si no se especifica, mostrará &quot;Estamos creando tu imagen&quot;
            </p>
            <div className="flex items-center gap-3 mt-2">
              <label htmlFor="loadingSubtitleColor" className="text-sm text-gray-700">
                Color del texto
              </label>
              <input
                type="color"
                id="loadingSubtitleColor"
                name="loadingSubtitleColor"
                value={formData.loadingSubtitleColor || "#1a1a1a"}
                onChange={handleChange}
                className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
              />
              <span className="text-xs text-gray-500">{formData.loadingSubtitleColor || "#1a1a1a"}</span>
            </div>
          </div>

          <ToggleField
            id="showLogosInLoader"
            label="Mostrar logos en pantalla de carga"
            description="Si está activado, se muestran los dos logos juntos arriba en la pantalla de carga. Si está desactivado, no se muestra ningún logo ahí."
            checked={formData.showLogosInLoader !== false}
            onChange={(checked) => setField("showLogosInLoader", checked)}
          />

          <ImageUploadField
            label="Imagen o GIF de Pantalla de Inactividad (screensaver)"
            value={formData.splashImage || ""}
            onChange={(value) => handleImageChange("splashImage", value)}
          />
          <p className="text-xs text-gray-500 -mt-2">
            Se usa como fondo de la pantalla de inactividad (screensaver), que aparece tras un rato sin uso, si no
            hay video configurado más abajo. No agrega texto ni botón encima — si querés un aviso tipo &quot;toca
            para continuar&quot;, incluilo en el diseño de la imagen/gif. No afecta la splash inicial (ver más abajo).
          </p>

          <ToggleField
            id="showSplashScreen"
            label="Mostrar pantalla de splash inicial"
            description="Si está activado, antes de la selección de marca/foto se muestra la pantalla de bienvenida configurable de abajo (título, tarjeta, botón); tocar el botón, o la pantalla una vez cargó, arranca el evento."
            checked={formData.showSplashScreen === true}
            onChange={(checked) => setField("showSplashScreen", checked)}
          />

          <div className="border-t border-gray-200 pt-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-800">Contenido de la Splash</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                El fondo y el logo superior de esta pantalla son los mismos configurados arriba
                como &quot;Imagen de Fondo&quot; y &quot;Logo Superior&quot; del evento.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <textarea
                name="splashTitle"
                value={formData.splashTitle || ""}
                onChange={handleChange}
                placeholder={"Ej: TU ROSTRO,\nTU ARTE"}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Si no se especifica, muestra el título de referencia (&quot;Tu rostro, tu
                arte&quot;). Un salto de línea separa el texto en dos líneas animadas.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <label htmlFor="splashTitleColor" className="text-sm text-gray-700">
                  Color del título
                </label>
                <input
                  type="color"
                  id="splashTitleColor"
                  name="splashTitleColor"
                  value={formData.splashTitleColor || "#E4032E"}
                  onChange={handleChange}
                  className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                />
                <span className="text-xs text-gray-500">{formData.splashTitleColor || "#E4032E"}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtítulo</label>
              <input
                type="text"
                name="splashSubtitle"
                value={formData.splashSubtitle || ""}
                onChange={handleChange}
                placeholder="Ej: Conviértete en una obra de arte"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <div className="flex items-center gap-3 mt-2">
                <label htmlFor="splashSubtitleColor" className="text-sm text-gray-700">
                  Color del subtítulo
                </label>
                <input
                  type="color"
                  id="splashSubtitleColor"
                  name="splashSubtitleColor"
                  value={formData.splashSubtitleColor || "#2B2118"}
                  onChange={handleChange}
                  className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                />
                <span className="text-xs text-gray-500">{formData.splashSubtitleColor || "#2B2118"}</span>
              </div>
            </div>

            <ImageUploadField
              label="Imagen de la Tarjeta Central (logo, mascota u otra imagen)"
              value={formData.splashCardImage || ""}
              onChange={(value) => handleImageChange("splashCardImage", value)}
            />
            <p className="text-xs text-gray-500 -mt-2">
              Si no se sube ninguna imagen, la tarjeta central no se muestra.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Palabra decorativa 1 (ej. &quot;ARTE&quot;)
                </label>
                <input
                  type="text"
                  name="splashWord1"
                  value={formData.splashWord1 || ""}
                  onChange={handleChange}
                  placeholder="ARTE"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="color"
                    id="splashWord1Color"
                    name="splashWord1Color"
                    value={formData.splashWord1Color || "#1FB6C4"}
                    onChange={handleChange}
                    className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500">{formData.splashWord1Color || "#1FB6C4"}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Palabra decorativa 2 (ej. &quot;COLOR&quot;)
                </label>
                <input
                  type="text"
                  name="splashWord2"
                  value={formData.splashWord2 || ""}
                  onChange={handleChange}
                  placeholder="COLOR"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="color"
                    id="splashWord2Color"
                    name="splashWord2Color"
                    value={formData.splashWord2Color || "#F0369A"}
                    onChange={handleChange}
                    className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500">{formData.splashWord2Color || "#F0369A"}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Degradado de la barra de carga
              </label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="splashLoaderColorFrom"
                    name="splashLoaderColorFrom"
                    value={formData.splashLoaderColorFrom || "#F7A600"}
                    onChange={handleChange}
                    className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500">Inicio</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="splashLoaderColorTo"
                    name="splashLoaderColorTo"
                    value={formData.splashLoaderColorTo || "#E4032E"}
                    onChange={handleChange}
                    className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500">Final</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Botón &quot;Toca para comenzar&quot;
              </label>
              <input
                type="text"
                name="splashButtonText"
                value={formData.splashButtonText || ""}
                onChange={handleChange}
                placeholder="Toca para comenzar"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="splashButtonColorFrom"
                    name="splashButtonColorFrom"
                    value={formData.splashButtonColorFrom || "#F2143C"}
                    onChange={handleChange}
                    className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500">Inicio</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="splashButtonColorTo"
                    name="splashButtonColorTo"
                    value={formData.splashButtonColorTo || "#C40024"}
                    onChange={handleChange}
                    className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500">Final</span>
                </div>
              </div>
            </div>
          </div>

          <VideoUploadField
            label="Video de Pantalla de Inactividad / Salvapantallas (loop, opcional)"
            value={formData.screenSaverVideoUrl || ""}
            onChange={(value) => handleImageChange("screenSaverVideoUrl", value)}
          />
          <p className="text-xs text-gray-500 -mt-2">
            Si se sube un video, tiene prioridad sobre la imagen/gif de arriba y se reproduce en loop en la pantalla
            de inactividad. No afecta la splash inicial (ver más abajo).
          </p>

          <SelectField
            label="Animación de Fondo"
            value={formData.backgroundAnimation || "NONE"}
            onChange={(v) => setField("backgroundAnimation", v as "NONE" | "FLOATING_ORBS")}
            helperText='Se muestra detrás de toda la app (selección de marca, cámara, resultado). "Esferas de colores" agrega formas difuminadas de colores derivando lentamente de fondo.'
          >
            <option value="NONE">Sin animación (actual)</option>
            <option value="FLOATING_ORBS">Esferas de colores flotando</option>
          </SelectField>
        </AccordionSection>

        {/* Prompts */}
        <AccordionSection title="Prompts (Marca IA)" icon={FaRobot}>
          {loadingPrompts ? (
            <p className="text-gray-600 text-sm">Cargando prompts disponibles...</p>
          ) : availablePrompts.length === 0 ? (
            <p className="text-gray-600 text-sm">No hay prompts disponibles</p>
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
        </AccordionSection>

        {/* Form Actions */}
        <div className="flex gap-3 bg-white rounded-lg shadow-md p-4 sm:p-5 sticky bottom-0">
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
