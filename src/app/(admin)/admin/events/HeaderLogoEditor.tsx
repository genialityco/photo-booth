"use client";

import React, { useRef, useState } from "react";
import type { SplashHeaderLogo } from "@/app/services/photo-booth/eventService";

const MIN_WIDTH_PCT = 8;
const MAX_WIDTH_PCT = 90;
const SNAP_THRESHOLD_PX = 6;

// Ancho fijo del preview + una relación de aspecto tipo celular (9:19.5) como
// referencia para calcular el alto del header en px a partir de heightPct.
// Es una aproximación: el alto/ancho real del dispositivo del asistente varía,
// así que la posición final puede correrse levemente respecto a este preview.
const PREVIEW_WIDTH = 260;
const PREVIEW_FULL_HEIGHT = PREVIEW_WIDTH * (19.5 / 9);

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function newLogoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function HeaderLogoEditor({
  logos,
  heightPct,
  onChangeLogos,
  onChangeHeightPct,
  availableImages,
}: {
  logos: SplashHeaderLogo[];
  heightPct: number;
  onChangeLogos: (logos: SplashHeaderLogo[]) => void;
  onChangeHeightPct: (pct: number) => void;
  availableImages: { label: string; url: string }[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });

  const addLogo = (url: string) => {
    const id = newLogoId();
    const next: SplashHeaderLogo = {
      id,
      url,
      xPct: clamp(10 + logos.length * 8, 0, 60),
      yPct: 20,
      widthPct: 28,
    };
    onChangeLogos([...logos, next]);
    setSelectedId(id);
  };

  const updateLogo = (id: string, patch: Partial<SplashHeaderLogo>) => {
    onChangeLogos(logos.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLogo = (id: string) => {
    onChangeLogos(logos.filter((l) => l.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("La imagen es demasiado grande. El tamaño máximo es 10MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      addLogo(result);
    };
    reader.onerror = () => alert("Error al leer el archivo. Intenta con otra imagen.");
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const boxHeight = Math.round((PREVIEW_FULL_HEIGHT * heightPct) / 100);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Alto del header ({heightPct}% de la pantalla)
        </label>
        <input
          type="range"
          min={8}
          max={40}
          value={heightPct}
          onChange={(e) => onChangeHeightPct(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {availableImages.map((img) => (
          <button
            key={img.url}
            type="button"
            onClick={() => addLogo(img.url)}
            title={`Agregar ${img.label} al header`}
            className="flex items-center gap-1.5 px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 text-xs text-gray-700"
          >
            <img src={img.url} alt="" className="w-6 h-6 object-contain rounded-sm bg-gray-100" />
            {img.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-1.5 border border-dashed border-gray-400 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
        >
          + Subir logo nuevo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div
        ref={containerRef}
        onPointerDown={() => setSelectedId(null)}
        className="relative border border-gray-300 rounded-lg overflow-hidden mx-auto"
        style={{
          width: PREVIEW_WIDTH,
          height: Math.max(boxHeight, 40),
          backgroundImage:
            "linear-gradient(45deg, #f3f4f6 25%, transparent 25%), linear-gradient(-45deg, #f3f4f6 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f3f4f6 75%), linear-gradient(-45deg, transparent 75%, #f3f4f6 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
        }}
      >
        {/* Cruceta central: se resalta cuando el logo arrastrado queda
            centrado en ese eje. */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: snapGuides.x ? 2 : 1,
              background: snapGuides.x ? "#ec4899" : "rgba(0,0,0,.18)",
              boxShadow: snapGuides.x ? "0 0 6px rgba(236,72,153,.8)" : "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: snapGuides.y ? 2 : 1,
              background: snapGuides.y ? "#ec4899" : "rgba(0,0,0,.18)",
              boxShadow: snapGuides.y ? "0 0 6px rgba(236,72,153,.8)" : "none",
            }}
          />
        </div>

        {logos.map((logo) => (
          <DraggableLogo
            key={logo.id}
            logo={logo}
            selected={selectedId === logo.id}
            containerRef={containerRef}
            onSelect={() => setSelectedId(logo.id)}
            onChange={(patch) => updateLogo(logo.id, patch)}
            onRemove={() => removeLogo(logo.id)}
            onSnapChange={setSnapGuides}
          />
        ))}
        {logos.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 px-4 text-center pointer-events-none">
            Agregá logos desde arriba y arrastralos acá
          </p>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Arrastrá cada logo para posicionarlo (se resalta una guía rosa cuando queda centrado); usá la
        esquina inferior derecha para cambiar el tamaño. Vista previa aproximada — el resultado real
        puede variar levemente según la pantalla del dispositivo.
      </p>
    </div>
  );
}

function DraggableLogo({
  logo,
  selected,
  containerRef,
  onSelect,
  onChange,
  onRemove,
  onSnapChange,
}: {
  logo: SplashHeaderLogo;
  selected: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (patch: Partial<SplashHeaderLogo>) => void;
  onRemove: () => void;
  onSnapChange: (snap: { x: boolean; y: boolean }) => void;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startHeightPx: number;
    start: SplashHeaderLogo;
  } | null>(null);

  const startDrag = (mode: "move" | "resize", e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    outerRef.current?.setPointerCapture(e.pointerId);
    const rect = outerRef.current?.getBoundingClientRect();
    dragState.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startHeightPx: rect?.height || 1,
      start: logo,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
    if (st.mode === "move") {
      let xPct = clamp(st.start.xPct + dxPct, 0, 100 - st.start.widthPct);
      let yPct = clamp(st.start.yPct + dyPct, 0, 100);

      const elCenterXPx = (xPct / 100) * rect.width + ((st.start.widthPct / 100) * rect.width) / 2;
      const snapX = Math.abs(elCenterXPx - rect.width / 2) < SNAP_THRESHOLD_PX;
      if (snapX) {
        xPct = ((rect.width / 2 - ((st.start.widthPct / 100) * rect.width) / 2) / rect.width) * 100;
      }

      const elCenterYPx = (yPct / 100) * rect.height + st.startHeightPx / 2;
      const snapY = Math.abs(elCenterYPx - rect.height / 2) < SNAP_THRESHOLD_PX;
      if (snapY) yPct = ((rect.height / 2 - st.startHeightPx / 2) / rect.height) * 100;

      onSnapChange({ x: snapX, y: snapY });
      onChange({ xPct, yPct });
    } else {
      onChange({
        widthPct: clamp(st.start.widthPct + dxPct, MIN_WIDTH_PCT, MAX_WIDTH_PCT),
      });
    }
  };

  const endDrag = () => {
    dragState.current = null;
    onSnapChange({ x: false, y: false });
  };

  return (
    <div
      ref={outerRef}
      onPointerDown={(e) => startDrag("move", e)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "absolute",
        left: `${logo.xPct}%`,
        top: `${logo.yPct}%`,
        width: `${logo.widthPct}%`,
        touchAction: "none",
        cursor: "move",
        outline: selected ? "2px solid #2563eb" : "1px dashed rgba(0,0,0,.3)",
        outlineOffset: 2,
      }}
    >
      <img
        src={logo.url}
        alt=""
        draggable={false}
        className="block w-full h-auto select-none pointer-events-none"
      />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Quitar logo"
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-xs leading-5 text-center shadow"
      >
        ×
      </button>
      <div
        onPointerDown={(e) => startDrag("resize", e)}
        title="Arrastrar para redimensionar"
        className="absolute -right-1 -bottom-1 w-3.5 h-3.5 rounded-sm bg-blue-600 shadow"
        style={{ cursor: "nwse-resize" }}
      />
    </div>
  );
}
