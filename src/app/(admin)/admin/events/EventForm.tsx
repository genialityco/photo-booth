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
  type SplashHeaderLogo,
  type SplashLayout,
} from "@/app/services/photo-booth/eventService";
import { getActivePhotoBoothPrompts, type PhotoBoothPrompt } from "@/app/services/photo-booth/brandService";
import { BUTTON_CLICK_EFFECT_OPTIONS } from "@/app/components/common/click-effects";
import { SPLASH_FONT_OPTIONS, resolveSplashFont } from "@/app/components/photo-booth/SplashScreen";
import {
  LOGO_SCALE_DEFAULT,
  LOGO_SCALE_MAX,
  LOGO_SCALE_MIN,
} from "@/app/components/photo-booth/logoBarSizing";
import ImageUploadField from "./ImageUploadField";
import VideoUploadField from "./VideoUploadField";
import HeaderLogoEditor from "./HeaderLogoEditor";
import SplashLayoutEditor from "./SplashLayoutEditor";

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

/**
 * Slider + número para el tamaño de un logo, en % del tamaño base.
 *
 * Vacío/undefined = 100 (el tamaño de siempre), así los eventos ya creados no
 * cambian de aspecto solo por abrir y guardar el formulario. El rango coincide
 * con el que aplica `clampLogoScale` al renderizar.
 */
function LogoScaleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  const current = value ?? LOGO_SCALE_DEFAULT;
  return (
    <div>
      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={LOGO_SCALE_MIN}
          max={LOGO_SCALE_MAX}
          step={5}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 min-w-0 accent-blue-600"
          aria-label={label}
        />
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={LOGO_SCALE_MIN}
            max={LOGO_SCALE_MAX}
            value={value ?? ""}
            placeholder={String(LOGO_SCALE_DEFAULT)}
            onChange={(e) =>
              onChange(e.target.value === "" ? undefined : Number(e.target.value))
            }
            className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-sm text-gray-500">%</span>
        </div>
      </div>
    </div>
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
    // Sin `|| 100`: dejarlos en undefined mantiene el campo fuera del doc de
    // Firestore mientras nadie lo toque, y el render ya trata "sin valor" como
    // 100 (ver clampLogoScale).
    logoTopScalePct: event?.logoTopScalePct,
    logoBottomScalePct: event?.logoBottomScalePct,
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
    loadingProgressColor: event?.loadingProgressColor || "#ef4444",
    loadingProgressTrackColor: event?.loadingProgressTrackColor || "",
    loadingPercentColor: event?.loadingPercentColor || "#000000",
    showLogosInLoader: event?.showLogosInLoader !== false,
    enableFrame: event?.enableFrame !== false,
    dataProcessingText: event?.dataProcessingText || "",
    generationType: event?.generationType || "IMAGE",
    buttonClickEffect: event?.buttonClickEffect || "NONE",
    handCursorEnabled: event?.handCursorEnabled === true,
    handRevealEnabled: event?.handRevealEnabled === true,
    revealEffect: event?.revealEffect || "HAND_WIPE",
    showSplashScreen: event?.showSplashScreen === true,
    splashUseVideo: event?.splashUseVideo === true,
    splashVideoUrl: event?.splashVideoUrl || "",
    splashHeaderHeightPct: event?.splashHeaderHeightPct || 18,
    splashHeaderLogos: event?.splashHeaderLogos || ([] as SplashHeaderLogo[]),
    splashFreeLayoutEnabled: event?.splashFreeLayoutEnabled === true,
    splashLayout: event?.splashLayout || ({} as SplashLayout),
    splashTitle: event?.splashTitle || "",
    splashTitleColor: event?.splashTitleColor || "#E4032E",
    splashTitleMode: event?.splashTitleMode || "TEXT",
    splashTitleSkewDeg: event?.splashTitleSkewDeg ?? -9,
    splashTitleImage: event?.splashTitleImage || "",
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
    splashTitleFont: event?.splashTitleFont || "default",
    splashSubtitleFont: event?.splashSubtitleFont || "default",
    splashWordsFont: event?.splashWordsFont || "default",
    captureBeforeFilter: event?.captureBeforeFilter === true,
    captureViewStyle: event?.captureViewStyle || "CLASSIC",
    imageCustomizationEnabled: event?.imageCustomizationEnabled === true,
    backgroundAnimation: event?.backgroundAnimation || "NONE",
    paintTimeSeconds: event?.paintTimeSeconds,
    mirrorScreenEnabled: event?.mirrorScreenEnabled !== false,
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

  // Imágenes ya cargadas a nivel de evento, ofrecidas como atajo para
  // agregarlas al header de la splash sin tener que volver a subirlas.
  const headerAvailableImages = (
    [
      { label: "Logo Superior", url: formData.logoTop },
      { label: "Logo Inferior", url: formData.logoBottom },
      { label: "Imagen de Fondo", url: formData.bgImage },
      { label: "Imagen del Botón", url: formData.buttonImage },
      { label: "Tarjeta Central (Splash)", url: formData.splashCardImage },
    ] as { label: string; url: string | undefined }[]
  ).filter((img): img is { label: string; url: string } => !!img.url);

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

          {/* Tamaño de los logos. Los logos se dimensionan por ALTO (ancho
              automático), así que subir el % los agranda sin deformarlos y sin
              que el de arriba y el de abajo se descuadren entre sí. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LogoScaleField
              label="Tamaño del Logo Superior"
              value={formData.logoTopScalePct}
              onChange={(value) => setField("logoTopScalePct", value)}
            />
            <LogoScaleField
              label="Tamaño del Logo Inferior"
              value={formData.logoBottomScalePct}
              onChange={(value) => setField("logoBottomScalePct", value)}
            />
          </div>
          <p className="text-xs text-gray-500 -mt-1">
            100% es el tamaño por defecto. Se aplica en el preview, el resultado, el revelado y la pantalla de carga. La pantalla de captura y la splash tienen su propio diseño de logos y no se ven afectadas.
          </p>

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

          <ToggleField
            id="mirrorScreenEnabled"
            label="Pantalla espejo automática en un segundo dispositivo"
            description='Si está activado (por defecto), al abrir la misma URL del booth en una segunda pestaña/dispositivo mientras el primero ya está activo, esa segunda pantalla se convierte automáticamente en un espejo pasivo en tiempo real del primero (útil para una TV o pantalla de apoyo detrás del booth). Si se desactiva, cada dispositivo que abra la URL funciona de forma independiente como booth interactivo normal, sin detectar ni reflejar a otros.'
            checked={formData.mirrorScreenEnabled !== false}
            onChange={(checked) => setField("mirrorScreenEnabled", checked)}
          />
        </AccordionSection>

        {/* Revelado de la Foto */}
        <AccordionSection title="Revelado de la Foto" icon={FaHandPaper}>
          <SelectField
            label="Efecto de Revelado de la Foto"
            value={formData.revealEffect || "HAND_WIPE"}
            onChange={(v) =>
              setField(
                "revealEffect",
                v as "NONE" | "HAND_WIPE" | "ROLLER" | "ROLLER_COLOR" | "KINECT_ROLLER"
              )
            }
            helperText='Cómo se revela la foto generada antes de mostrar el resultado final. Con "Rodillo" basta con pasar la mano (o el dedo, si no hay cámara) sobre la foto. "Blanco y negro a color" usa el mismo rodillo pero arranca la foto en blanco y negro y va pintando el color al pasarlo. "Rodillo Kinect" es para instalaciones con pantalla gigante + Kinect + rodillo físico: el tablet no revela nada por sí mismo, solo espera a que termine en la pantalla grande.'
          >
            <option value="NONE">Sin efecto (pasa directo al resultado)</option>
            <option value="HAND_WIPE">Borrar el velo con la mano</option>
            <option value="ROLLER">Rodillo de pintura (descubre la foto)</option>
            <option value="ROLLER_COLOR">Rodillo: blanco y negro a color</option>
            <option value="KINECT_ROLLER">Rodillo Kinect (pantalla gigante)</option>
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

        {/* Pantalla 1: Splash inicial — primero porque es lo primero que ve el asistente */}
        <AccordionSection title="Pantalla 1 · Splash Inicial" icon={FaDesktop}>
          <ToggleField
            id="showSplashScreen"
            label="Mostrar pantalla de splash inicial"
            description="Si está activado, antes de la selección de marca/foto se muestra la pantalla de bienvenida configurable de abajo (título, tarjeta, botón); tocar el botón, o la pantalla una vez cargó, arranca el evento."
            checked={formData.showSplashScreen === true}
            onChange={(checked) => setField("showSplashScreen", checked)}
          />

          <ToggleField
            id="splashUseVideo"
            label="Reemplazar la animación de la splash por un video de fondo"
            description="Si está activado y hay un video cargado abajo, la splash muestra ese video en loop en vez de la animación (logo, título, subtítulo, tarjeta, palabras); la barra de carga y el botón se mantienen superpuestos abajo, sobre el video."
            checked={formData.splashUseVideo === true}
            onChange={(checked) => setField("splashUseVideo", checked)}
          />

          <VideoUploadField
            label="Video de Fondo de la Splash (loop, opcional)"
            value={formData.splashVideoUrl || ""}
            onChange={(value) => handleImageChange("splashVideoUrl", value)}
          />

          <div className="border-t border-gray-200 pt-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-800">Contenido de la Splash</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                El fondo de esta pantalla es el mismo configurado arriba como &quot;Imagen de
                Fondo&quot; del evento. El logo de arriba usa &quot;Logo Superior&quot; salvo que
                agregues logos al header de abajo, que lo reemplaza.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Header (logos)</h4>
              <HeaderLogoEditor
                logos={formData.splashHeaderLogos || []}
                heightPct={formData.splashHeaderHeightPct || 18}
                onChangeLogos={(logos) => setField("splashHeaderLogos", logos)}
                onChangeHeightPct={(pct) => setField("splashHeaderHeightPct", pct)}
                availableImages={headerAvailableImages}
              />
            </div>

            {formData.splashUseVideo ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Con el video de fondo activado, el título/subtítulo/tarjeta/palabras de abajo no se
                muestran (los reemplaza el video) — se guardan igual por si desactivás el video más
                adelante.
              </p>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>

              <SelectField
                label="Tipo de título"
                value={formData.splashTitleMode || "TEXT"}
                onChange={(v) => setField("splashTitleMode", v as "TEXT" | "IMAGE")}
                helperText="Imagen reemplaza el texto animado por un logo o texto ya diseñado."
              >
                <option value="TEXT">Texto</option>
                <option value="IMAGE">Imagen</option>
              </SelectField>

              {formData.splashTitleMode === "IMAGE" ? (
                <div className="mt-2">
                  <ImageUploadField
                    label="Imagen del Título"
                    value={formData.splashTitleImage || ""}
                    onChange={(value) => handleImageChange("splashTitleImage", value)}
                  />
                  <p className="text-xs text-gray-500 -mt-2">
                    Se muestra donde iría el título de texto, con la misma animación de entrada. Si no se
                    sube ninguna imagen, se usa el texto de abajo como respaldo.
                  </p>
                </div>
              ) : null}

              <div className={formData.splashTitleMode === "IMAGE" ? "mt-4 opacity-60" : "mt-2"}>
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
                <div className="mt-2">
                  <SelectField
                    label="Fuente del título"
                    value={formData.splashTitleFont || "default"}
                    onChange={(v) => setField("splashTitleFont", v)}
                  >
                    {SPLASH_FONT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <label htmlFor="splashTitleSkewDeg" className="text-sm text-gray-700">
                    Inclinación del título
                  </label>
                  <input
                    type="number"
                    id="splashTitleSkewDeg"
                    min={-45}
                    max={45}
                    step={1}
                    value={formData.splashTitleSkewDeg ?? -9}
                    onChange={(e) => setField("splashTitleSkewDeg", Number(e.target.value))}
                    className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-xs text-gray-500">grados (0 = recto, sin cursiva)</span>
                </div>
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
              <div className="mt-2">
                <SelectField
                  label="Fuente del subtítulo"
                  value={formData.splashSubtitleFont || "default"}
                  onChange={(v) => setField("splashSubtitleFont", v)}
                >
                  {SPLASH_FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </SelectField>
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

            <SelectField
              label="Fuente de las palabras decorativas"
              value={formData.splashWordsFont || "default"}
              onChange={(v) => setField("splashWordsFont", v)}
              helperText="Aplica a las dos palabras (ARTE / COLOR) de arriba."
            >
              {SPLASH_FONT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>

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
                Botón &quot;Toca para comenzar&quot; (texto, solo de la splash)
              </label>
              <input
                type="text"
                name="splashButtonText"
                value={formData.splashButtonText || ""}
                onChange={handleChange}
                placeholder="Toca para comenzar"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-2">
                Degradado de los botones principales — se usa acá en la splash y también en el resto
                del flujo (Repetir/Confirmar, ¡Listo!, Nueva foto/Descargar, Empezar), salvo que ese
                botón tenga su propia imagen configurada (&quot;Imagen del Botón&quot; arriba).
              </p>
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

            <div className="border-t border-gray-200 pt-4">
              <SplashLayoutEditor
                enabled={formData.splashFreeLayoutEnabled === true}
                onToggleEnabled={(v) => setField("splashFreeLayoutEnabled", v)}
                layout={formData.splashLayout || {}}
                onChangeLayout={(layout) => setField("splashLayout", layout)}
                onReset={() => setField("splashLayout", {})}
                headerLogos={formData.splashHeaderLogos || []}
                preview={{
                  logoTop: formData.logoTop || "",
                  titleIsImage: formData.splashTitleMode === "IMAGE",
                  titleImage: formData.splashTitleImage || "",
                  titleText: formData.splashTitle || "TU ROSTRO,\nTU ARTE",
                  titleColor: formData.splashTitleColor || "#E4032E",
                  titleFontCss: resolveSplashFont(formData.splashTitleFont, "title"),
                  subtitleText: formData.splashSubtitle || "Conviértete en una obra de arte",
                  subtitleColor: formData.splashSubtitleColor || "#2B2118",
                  subtitleFontCss: resolveSplashFont(formData.splashSubtitleFont, "subtitle"),
                  word1Text: formData.splashWord1 || "ARTE",
                  word1Color: formData.splashWord1Color || "#1FB6C4",
                  word2Text: formData.splashWord2 || "COLOR",
                  word2Color: formData.splashWord2Color || "#F0369A",
                  wordsFontCss: resolveSplashFont(formData.splashWordsFont, "title"),
                  cardImage: formData.splashCardImage || "",
                  loaderFrom: formData.splashLoaderColorFrom || "#F7A600",
                  loaderTo: formData.splashLoaderColorTo || "#E4032E",
                  buttonText: formData.splashButtonText || "Toca para comenzar",
                  buttonFrom: formData.splashButtonColorFrom || "#F2143C",
                  buttonTo: formData.splashButtonColorTo || "#C40024",
                }}
              />
            </div>
          </div>
        </AccordionSection>

        {/* Pantalla 2: Carga (Loading) — se muestra mientras se genera la imagen */}
        <AccordionSection title="Pantalla 2 · Carga (Loading)" icon={FaDesktop}>
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

          <div>
            <label htmlFor="loadingProgressColor" className="block text-sm font-medium text-gray-700 mb-1">
              Color del anillo de progreso
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Color de la parte YA RELLENADA del círculo/barra de carga animada mientras se genera la imagen.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="loadingProgressColor"
                name="loadingProgressColor"
                value={formData.loadingProgressColor || "#ef4444"}
                onChange={handleChange}
                className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
              />
              <span className="text-xs text-gray-500">{formData.loadingProgressColor || "#ef4444"}</span>
            </div>
          </div>

          <div>
            <label htmlFor="loadingProgressTrackColor" className="block text-sm font-medium text-gray-700 mb-1">
              Color del fondo del anillo
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Color de la parte AÚN NO rellenada del anillo. Por defecto es gris translúcido — al elegir un color acá
              se vuelve sólido (sin transparencia).
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="loadingProgressTrackColor"
                name="loadingProgressTrackColor"
                value={
                  formData.loadingProgressTrackColor && formData.loadingProgressTrackColor.startsWith("#")
                    ? formData.loadingProgressTrackColor
                    : "#000000"
                }
                onChange={handleChange}
                className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
              />
              <span className="text-xs text-gray-500">
                {formData.loadingProgressTrackColor || "rgba(0,0,0,0.15) (por defecto)"}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="loadingPercentColor" className="block text-sm font-medium text-gray-700 mb-1">
              Color del porcentaje
            </label>
            <p className="text-xs text-gray-500 mb-2">Color del número (%) en el centro del anillo.</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="loadingPercentColor"
                name="loadingPercentColor"
                value={formData.loadingPercentColor || "#000000"}
                onChange={handleChange}
                className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
              />
              <span className="text-xs text-gray-500">{formData.loadingPercentColor || "#000000"}</span>
            </div>
          </div>

          <ToggleField
            id="showLogosInLoader"
            label="Mostrar logos en pantalla de carga"
            description="Si está activado, se muestran los dos logos juntos arriba en la pantalla de carga. Si está desactivado, no se muestra ningún logo ahí."
            checked={formData.showLogosInLoader !== false}
            onChange={(checked) => setField("showLogosInLoader", checked)}
          />
        </AccordionSection>

        {/* Pantalla 3: Inactividad (screensaver) y fondo animado de toda la app */}
        <AccordionSection title="Pantalla 3 · Inactividad y Fondo" icon={FaDesktop}>
          <ImageUploadField
            label="Imagen o GIF de Pantalla de Inactividad (screensaver)"
            value={formData.splashImage || ""}
            onChange={(value) => handleImageChange("splashImage", value)}
          />
          <p className="text-xs text-gray-500 -mt-2">
            Se usa como fondo de la pantalla de inactividad (screensaver), que aparece tras un rato sin uso, si no
            hay video configurado más abajo. No agrega texto ni botón encima — si querés un aviso tipo &quot;toca
            para continuar&quot;, incluilo en el diseño de la imagen/gif. No afecta la splash inicial.
          </p>

          <VideoUploadField
            label="Video de Pantalla de Inactividad / Salvapantallas (loop, opcional)"
            value={formData.screenSaverVideoUrl || ""}
            onChange={(value) => handleImageChange("screenSaverVideoUrl", value)}
          />
          <p className="text-xs text-gray-500 -mt-2">
            Si se sube un video, tiene prioridad sobre la imagen/gif de arriba y se reproduce en loop en la pantalla
            de inactividad. No afecta la splash inicial.
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
