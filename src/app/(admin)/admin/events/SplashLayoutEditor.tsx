"use client";

import React, { useRef, useState } from "react";
import type {
  SplashFreeElementKind,
  SplashFreeElement,
  SplashHeaderLogo,
  SplashLayout,
} from "@/app/services/photo-booth/eventService";
import { SPLASH_FREE_LAYOUT_DEFAULTS, anton, barlowCondensed } from "@/app/components/photo-booth/SplashScreen";

const MIN_SCALE = 40;
const MAX_SCALE = 250;
const SNAP_THRESHOLD_PX = 6;
const GRID_LINES_PCT = [10, 20, 30, 40, 50, 60, 70, 80, 90];

// Mismo criterio de referencia que HeaderLogoEditor: ancho fijo + relación de
// aspecto tipo celular (9:19.5). Acá el canvas representa la pantalla
// COMPLETA (no solo el header), así que los tamaños de fuente del preview son
// valores fijos elegidos a ojo para verse proporcionados en este ancho —no
// son los mismos clamp() del render real, que usan vmin del dispositivo.
const PREVIEW_WIDTH = 260;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (19.5 / 9));

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

const ELEMENT_LABELS: Record<SplashFreeElementKind, string> = {
  logo: "Logo",
  title: "Título",
  subtitle: "Subtítulo",
  word1: "Palabra 1",
  word2: "Palabra 2",
  card: "Tarjeta",
  bar: "Barra de carga",
  button: "Botón",
};

export type SplashLayoutPreviewData = {
  logoTop: string;
  titleText: string;
  titleColor: string;
  titleFontCss: string;
  titleIsImage: boolean;
  titleImage: string;
  subtitleText: string;
  subtitleColor: string;
  subtitleFontCss: string;
  word1Text: string;
  word1Color: string;
  word2Text: string;
  word2Color: string;
  wordsFontCss: string;
  cardImage: string;
  loaderFrom: string;
  loaderTo: string;
  buttonText: string;
  buttonFrom: string;
  buttonTo: string;
};

export default function SplashLayoutEditor({
  enabled,
  onToggleEnabled,
  layout,
  onChangeLayout,
  onReset,
  headerLogos,
  preview,
}: {
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  layout: SplashLayout;
  onChangeLayout: (layout: SplashLayout) => void;
  onReset: () => void;
  headerLogos: SplashHeaderLogo[];
  preview: SplashLayoutPreviewData;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });

  const hasHeaderLogos = headerLogos.length > 0;
  const kinds: SplashFreeElementKind[] = [
    ...(!hasHeaderLogos && preview.logoTop ? (["logo"] as const) : []),
    "title",
    "subtitle",
    "word1",
    "word2",
    ...(preview.cardImage ? (["card"] as const) : []),
    "bar",
    "button",
  ];

  const getPos = (kind: SplashFreeElementKind): SplashFreeElement =>
    layout[kind] || SPLASH_FREE_LAYOUT_DEFAULTS[kind];

  const updatePos = (kind: SplashFreeElementKind, patch: Partial<SplashFreeElement>) => {
    onChangeLayout({ ...layout, [kind]: { ...getPos(kind), ...patch } });
  };

  const getLogoPos = (logo: SplashHeaderLogo, i: number): SplashFreeElement =>
    layout.logos?.[logo.id] || { xPct: 5 + i * 30, yPct: 3, scalePct: 100 };

  const updateLogoPos = (logoId: string, base: SplashFreeElement, patch: Partial<SplashFreeElement>) => {
    onChangeLayout({
      ...layout,
      logos: { ...layout.logos, [logoId]: { ...base, ...patch } },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="splashFreeLayoutEnabled"
          className="w-5 h-5 mt-0.5"
          checked={enabled}
          onChange={(e) => onToggleEnabled(e.target.checked)}
        />
        <label htmlFor="splashFreeLayoutEnabled" className="text-sm">
          <span className="font-medium text-gray-700">Diseño libre de la pantalla</span>
          <p className="text-xs text-gray-500 mt-0.5">
            Arrastrá y redimensioná logo(s), título (texto o imagen), subtítulo, palabras,
            tarjeta, barra y botón donde quieras. Sin activar esto, la splash usa el diseño
            responsivo de siempre (recomendado salvo que necesites algo muy específico). La
            posición se guarda en % de pantalla, así que se adapta a distintos altos/anchos de
            celular en vertical — igual, revisá el resultado en un dispositivo real antes de dar
            por terminado, sobre todo si el aspecto es muy distinto al de este preview (tipo
            celular moderno, 9:19.5).
          </p>
        </label>
      </div>

      {enabled && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Tocá un elemento para seleccionarlo, arrastralo para moverlo y usá la esquina para
              cambiar el tamaño.
            </p>
            <button
              type="button"
              onClick={onReset}
              className="px-2 py-1 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 whitespace-nowrap ml-2"
            >
              Restablecer posiciones
            </button>
          </div>

          <div
            ref={containerRef}
            onPointerDown={() => setSelected(null)}
            className={`relative border border-gray-300 rounded-lg overflow-hidden mx-auto ${anton.variable} ${barlowCondensed.variable}`}
            style={{
              width: PREVIEW_WIDTH,
              height: PREVIEW_HEIGHT,
              background: preview.cardImage
                ? "#2a2a2a"
                : "radial-gradient(120% 90% at 50% 30%, #FFE79A 0%, #FDD962 45%, #F7C63F 100%)",
            }}
          >
            {/* Cuadrícula tenue (cada 10%) + cruceta central: el eje se
                resalta (color + grosor) mientras arrastrás un elemento y su
                centro queda alineado con el centro del lienzo. */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              {GRID_LINES_PCT.map((pct) => (
                <React.Fragment key={pct}>
                  <div
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: "rgba(255,255,255,.14)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: `${pct}%`,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: "rgba(255,255,255,.14)",
                    }}
                  />
                </React.Fragment>
              ))}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: snapGuides.x ? 2 : 1,
                  background: snapGuides.x ? "#ec4899" : "rgba(255,255,255,.4)",
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
                  background: snapGuides.y ? "#ec4899" : "rgba(255,255,255,.4)",
                  boxShadow: snapGuides.y ? "0 0 6px rgba(236,72,153,.8)" : "none",
                }}
              />
            </div>

            {hasHeaderLogos &&
              headerLogos.map((logo, i) => {
                const pos = getLogoPos(logo, i);
                return (
                  <FreeDraggable
                    key={logo.id}
                    label={`Logo ${i + 1}`}
                    pos={pos}
                    selected={selected === `logo:${logo.id}`}
                    containerRef={containerRef}
                    onSelect={() => setSelected(`logo:${logo.id}`)}
                    onChange={(patch) => updateLogoPos(logo.id, pos, patch)}
                    onSnapChange={setSnapGuides}
                  >
                    <img
                      src={logo.url}
                      alt=""
                      draggable={false}
                      style={{ width: 44, height: "auto", display: "block" }}
                    />
                  </FreeDraggable>
                );
              })}

            {kinds.map((kind) => (
              <FreeDraggable
                key={kind}
                label={ELEMENT_LABELS[kind]}
                pos={getPos(kind)}
                selected={selected === kind}
                containerRef={containerRef}
                onSelect={() => setSelected(kind)}
                onChange={(patch) => updatePos(kind, patch)}
                onSnapChange={setSnapGuides}
              >
                <ElementPreview kind={kind} preview={preview} />
              </FreeDraggable>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FreeDraggable({
  label,
  pos,
  selected,
  containerRef,
  onSelect,
  onChange,
  onSnapChange,
  children,
}: {
  label: string;
  pos: SplashFreeElement;
  selected: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (patch: Partial<SplashFreeElement>) => void;
  onSnapChange: (snap: { x: boolean; y: boolean }) => void;
  children: React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startWidthPx: number;
    startHeightPx: number;
    start: SplashFreeElement;
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
      startWidthPx: rect?.width || 1,
      startHeightPx: rect?.height || 1,
      start: pos,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (st.mode === "move") {
      const dxPct = (dx / rect.width) * 100;
      const dyPct = (dy / rect.height) * 100;
      let xPct = clamp(st.start.xPct + dxPct, 0, 96);
      let yPct = clamp(st.start.yPct + dyPct, 0, 96);

      // Snapea al centro del lienzo (eje X y/o Y) cuando el centro del
      // elemento queda a pocos px del centro real — mismo criterio que las
      // guías tipo Figma/PowerPoint.
      const elCenterX = (xPct / 100) * rect.width + st.startWidthPx / 2;
      const snapX = Math.abs(elCenterX - rect.width / 2) < SNAP_THRESHOLD_PX;
      if (snapX) xPct = ((rect.width / 2 - st.startWidthPx / 2) / rect.width) * 100;

      const elCenterY = (yPct / 100) * rect.height + st.startHeightPx / 2;
      const snapY = Math.abs(elCenterY - rect.height / 2) < SNAP_THRESHOLD_PX;
      if (snapY) yPct = ((rect.height / 2 - st.startHeightPx / 2) / rect.height) * 100;

      onSnapChange({ x: snapX, y: snapY });
      onChange({ xPct, yPct });
    } else {
      const factor = 1 + dx / st.startWidthPx;
      onChange({ scalePct: clamp(Math.round(st.start.scalePct * factor), MIN_SCALE, MAX_SCALE) });
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
      title={label}
      style={{
        position: "absolute",
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        transform: `scale(${pos.scalePct / 100})`,
        transformOrigin: "top left",
        touchAction: "none",
        cursor: "move",
        outline: selected ? "2px solid #2563eb" : "1px dashed rgba(255,255,255,.5)",
        outlineOffset: 3,
      }}
    >
      <div className="pointer-events-none">{children}</div>
      <div
        onPointerDown={(e) => startDrag("resize", e)}
        title="Arrastrar para redimensionar"
        className="absolute -right-1 -bottom-1 w-3 h-3 rounded-sm bg-blue-600 shadow"
        style={{ cursor: "nwse-resize" }}
      />
    </div>
  );
}

function ElementPreview({
  kind,
  preview,
}: {
  kind: SplashFreeElementKind;
  preview: SplashLayoutPreviewData;
}) {
  switch (kind) {
    case "logo":
      return preview.logoTop ? (
        <img
          src={preview.logoTop}
          alt=""
          draggable={false}
          style={{ width: 44, height: "auto", display: "block" }}
        />
      ) : null;
    case "title":
      return preview.titleIsImage && preview.titleImage ? (
        <img
          src={preview.titleImage}
          alt=""
          draggable={false}
          style={{ width: 100, height: "auto", display: "block" }}
        />
      ) : (
        <div
          style={{
            fontFamily: preview.titleFontCss,
            fontSize: 22,
            lineHeight: 1,
            color: preview.titleColor,
            whiteSpace: "nowrap",
            textShadow: "0 2px 0 rgba(255,255,255,.5)",
          }}
        >
          {preview.titleText.split("\n")[0] || "Título"}
        </div>
      );
    case "subtitle":
      return (
        <div
          style={{
            fontFamily: preview.subtitleFontCss,
            fontWeight: 800,
            fontSize: 10,
            textTransform: "uppercase",
            color: preview.subtitleColor,
            whiteSpace: "nowrap",
          }}
        >
          {preview.subtitleText || "Subtítulo"}
        </div>
      );
    case "word1":
      return (
        <div
          style={{
            fontFamily: preview.wordsFontCss,
            fontSize: 16,
            color: preview.word1Color,
            transform: "rotate(-16deg)",
            whiteSpace: "nowrap",
          }}
        >
          {preview.word1Text || "ARTE"}
        </div>
      );
    case "word2":
      return (
        <div
          style={{
            fontFamily: preview.wordsFontCss,
            fontSize: 16,
            color: preview.word2Color,
            transform: "rotate(-14deg)",
            whiteSpace: "nowrap",
          }}
        >
          {preview.word2Text || "COLOR"}
        </div>
      );
    case "card":
      return preview.cardImage ? (
        <img
          src={preview.cardImage}
          alt=""
          draggable={false}
          style={{ width: 90, height: "auto", borderRadius: 10, display: "block" }}
        />
      ) : null;
    case "bar":
      return (
        <div
          style={{
            width: 90,
            height: 6,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${preview.loaderFrom}, ${preview.loaderTo})`,
          }}
        />
      );
    case "button":
      return (
        <div
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            background: `linear-gradient(180deg, ${preview.buttonFrom}, ${preview.buttonTo})`,
            color: "#fff",
            fontFamily: "var(--font-splash-anton), sans-serif",
            fontSize: 9,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {preview.buttonText || "Toca para comenzar"}
        </div>
      );
    default:
      return null;
  }
}
