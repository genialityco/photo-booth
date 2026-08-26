/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Anton, Barlow_Condensed, Roboto } from "next/font/google";
import {
  EventProfile,
  type SplashFreeElement,
  type SplashFreeElementKind,
} from "@/app/services/photo-booth/eventService";
import { runButtonClickEffect } from "@/app/components/common/click-effects";
import MediaTapScreen from "@/app/components/common/MediaTapScreen";

// Exportados para que SplashLayoutEditor.tsx pueda aplicar las mismas
// variables de fuente en el preview del admin — si no, el título/subtítulo/
// palabras/botón se miden ahí con la fuente por defecto del navegador en vez
// de Anton/Barlow, y el ancho de texto calculado (clave para centrar bien)
// no coincide con el render real.
export const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-splash-anton",
  display: "swap",
});
export const barlowCondensed = Barlow_Condensed({
  weight: ["700", "800"],
  subsets: ["latin"],
  variable: "--font-splash-barlow",
  display: "swap",
});
export const roboto = Roboto({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-splash-roboto",
  display: "swap",
});

const DEFAULT_TITLE = "TU ROSTRO,\nTU ARTE";
const DEFAULT_TITLE_COLOR = "#E4032E";
const DEFAULT_SUBTITLE = "Conviértete en una obra de arte";
const DEFAULT_SUBTITLE_COLOR = "#2B2118";
const DEFAULT_WORD1_COLOR = "#1FB6C4";
const DEFAULT_WORD2_COLOR = "#F0369A";
const DEFAULT_LOADER_FROM = "#F7A600";
const DEFAULT_LOADER_TO = "#E4032E";
const DEFAULT_BUTTON_TEXT = "Toca para comenzar";
const DEFAULT_BUTTON_FROM = "#F2143C";
const DEFAULT_BUTTON_TO = "#C40024";

/** Catálogo de fuentes seleccionables para el título/subtítulo/palabras de
 *  la splash (ver SelectFields "Fuente del..." en Pantalla 1 del admin).
 *  Usado tanto acá como en EventForm.tsx para poblar los <select>. */
export const SPLASH_FONT_OPTIONS = [
  { value: "default", label: "Predeterminada" },
  { value: "anton", label: "Anton" },
  { value: "barlow", label: "Barlow Condensed" },
  { value: "azo", label: "Azo Sans" },
  { value: "selima", label: "Selima (script)" },
  { value: "roboto", label: "Roboto" },
  { value: "jakarta", label: "Plus Jakarta Sans" },
] as const;

const SPLASH_FONT_CSS: Record<string, string> = {
  anton: "var(--font-splash-anton), sans-serif",
  barlow: "var(--font-splash-barlow), sans-serif",
  azo: "var(--font-azo), sans-serif",
  selima: "var(--font-selima), cursive",
  roboto: "var(--font-splash-roboto), sans-serif",
  // Variable (wght 200-800), declarada por @font-face en globals.css. A
  // diferencia de anton/barlow/roboto (next/font, cuya variable CSS solo
  // existe donde se aplica la clase `.variable`), --font-jakarta se define en
  // @theme y por lo tanto está disponible en todas partes, incluido el preview
  // del admin.
  //
  // El nombre real de la familia va como fallback DENTRO del var() a
  // propósito: si `--font-jakarta` no estuviera definida (CSS viejo cacheado,
  // un contexto que no cargue globals.css), `font-family: var(--indefinida),
  // sans-serif` no cae a sans-serif — queda inválida al calcular el valor y la
  // propiedad HEREDA la fuente del padre. O sea, el texto sale en una fuente
  // cualquiera en vez de en la elegida, sin ningún error visible.
  jakarta: 'var(--font-jakarta, "Plus Jakarta Sans"), "Plus Jakarta Sans", sans-serif',
};

// Con "default" (o sin el campo, eventos existentes) cada texto mantiene su
// fuente original: Anton para título/palabras, Barlow Condensed para
// subtítulo. Título/subtítulo/palabras eligen su fuente por separado — ver
// splashTitleFont/splashSubtitleFont/splashWordsFont.
export function resolveSplashFont(fontKey: string | undefined, role: "title" | "subtitle") {
  const fallback = role === "title" ? "anton" : "barlow";
  const key = fontKey && fontKey !== "default" ? fontKey : fallback;
  return SPLASH_FONT_CSS[key] || SPLASH_FONT_CSS[fallback];
}

/**
 * Relación de aspecto (ancho/alto) del "escenario" de referencia sobre el
 * que se calibran las posiciones xPct/yPct del layout libre — la misma que
 * usa el canvas de SplashLayoutEditor.tsx (celular 9:19.5), para que edición
 * y render real coincidan exactamente. Ver SPLASH_STAGE_ASPECT_RATIO más
 * abajo, donde se usa para acotar el escenario en pantallas mucho más anchas
 * que un celular (tablets, TV, desktop).
 */
export const SPLASH_STAGE_ASPECT_RATIO = 9 / 19.5;

/** Posiciones iniciales del layout libre (splashFreeLayoutEnabled), pensadas
 *  para acercarse al look del grid original en un celular vertical — el
 *  admin las ajusta a gusto desde el editor apenas activa el modo libre. Se
 *  usan como respaldo si el evento tiene el modo activo pero todavía le
 *  falta la posición de algún elemento puntual. */
export const SPLASH_FREE_LAYOUT_DEFAULTS: Record<SplashFreeElementKind, SplashFreeElement> = {
  logo: { xPct: 32, yPct: 2, scalePct: 100 },
  title: { xPct: 10, yPct: 14, scalePct: 100 },
  subtitle: { xPct: 10, yPct: 32, scalePct: 100 },
  card: { xPct: 25, yPct: 40, scalePct: 100 },
  word1: { xPct: 4, yPct: 36, scalePct: 100 },
  word2: { xPct: 68, yPct: 46, scalePct: 100 },
  bar: { xPct: 22, yPct: 80, scalePct: 100 },
  button: { xPct: 28, yPct: 87, scalePct: 100 },
};

function getFreeElement(
  event: EventProfile,
  kind: SplashFreeElementKind
): SplashFreeElement {
  return event.splashLayout?.[kind] || SPLASH_FREE_LAYOUT_DEFAULTS[kind];
}

/** Envuelve un elemento del layout libre en su posición/escala absoluta. */
function FreePositioned({
  event,
  kind,
  children,
}: {
  event: EventProfile;
  kind: SplashFreeElementKind;
  children: React.ReactNode;
}) {
  const pos = getFreeElement(event, kind);
  return (
    <div
      style={{
        position: "absolute",
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        transform: `scale(${pos.scalePct / 100})`,
        transformOrigin: "top left",
      }}
    >
      {children}
    </div>
  );
}

// Las palabras "word1"/"word2" son texto libre por evento: a mayor longitud,
// menor el factor (se multiplica por el ancho de la tarjeta vía la variable
// CSS --splash-card-w), para que un texto más largo que "ARTE"/"COLOR" no
// termine desbordando el margen lateral disponible junto a la tarjeta.
function wordFontFactor(word: string) {
  const len = word.trim().length || 1;
  return Math.max(0.075, Math.min(0.15, 0.85 / len));
}

export default function SplashScreen({
  event,
  onStart,
  wide = false,
  bgVideoUrl,
}: {
  event: EventProfile;
  onStart: () => void;
  /** Pantalla gigante (BoothMirror): el layout libre (splashFreeLayoutEnabled)
   * posiciona todo con xPct/yPct pensados para acercarse a un celular
   * vertical (ver SPLASH_FREE_LAYOUT_DEFAULTS) - en una pantalla ancha eso
   * deja la barra de carga y el botón corridos hacia la izquierda en vez de
   * centrados, y las imágenes se ven chicas relativo al espacio disponible.
   * Con esto: barra/botón se centran (dejan de usar FreePositioned) y las
   * imágenes del layout libre (logo, tarjeta, título en imagen) se agrandan.
   * Off por defecto (comportamiento original en la tablet). */
  wide?: boolean;
  /** Video de fondo (ej. el del salvapantallas del evento) en vez de
   * `event.bgImage`/el degradado con manchas de color - usado por
   * BoothMirror. No reemplaza el modo video propio de la splash
   * (`splashUseVideo`/`splashVideoUrl`, que ya trae su propia coreografía);
   * solo aplica como fondo del layout libre o del grid por defecto. */
  bgVideoUrl?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  // `bgVideoUrl` (el salvapantallas del evento, pasado por BoothMirror para
  // la pantalla gigante) fuerza este modo directamente, sin importar
  // splashUseVideo/splashFreeLayoutEnabled - así el video queda garantizado
  // sin depender de en qué rama (layout libre / grid por defecto) caiga la
  // splash para este evento en particular. Tiene prioridad sobre el video
  // propio de la splash (splashVideoUrl) cuando ambos están presentes.
  const effectiveVideoUrl = bgVideoUrl || event.splashVideoUrl;
  const isVideoMode = !!(bgVideoUrl || (event.splashUseVideo && event.splashVideoUrl));

  // La coreografía visual (logo → título → ... → botón) es un loop CSS
  // infinito, independiente de esto: acá solo se resuelve cuándo la pantalla
  // pasa a ser realmente tappable (assets visibles ya cargados), para no
  // dejar tocar antes de que el fondo/logo/tarjeta estén listos. En modo
  // video no hay ese set de imágenes que precargar (el video reemplaza toda
  // esa coreografía) — MediaTapScreen ya maneja su propio autoplay/retry, así
  // que ahí no hace falta esperar nada antes de dejar tocar.
  useEffect(() => {
    if (isVideoMode) {
      setReady(true);
      return;
    }

    let cancelled = false;
    const headerLogoUrls = (event.splashHeaderLogos || []).map((l) => l.url);
    const assets = [
      event.bgImage,
      event.splashHeaderLogos && event.splashHeaderLogos.length > 0 ? null : event.logoTop,
      event.splashCardImage,
      event.splashTitleMode === "IMAGE" ? event.splashTitleImage : null,
      ...headerLogoUrls,
    ].filter((src): src is string => !!src);

    if (assets.length === 0) {
      setReady(true);
      return;
    }

    let loaded = 0;
    const bump = () => {
      loaded += 1;
      if (!cancelled && loaded === assets.length) setReady(true);
    };
    assets.forEach((src) => {
      const img = new window.Image();
      img.onload = bump;
      img.onerror = bump;
      img.src = src;
    });

    return () => {
      cancelled = true;
    };
  }, [
    isVideoMode,
    event.bgImage,
    event.logoTop,
    event.splashCardImage,
    event.splashTitleMode,
    event.splashTitleImage,
    event.splashHeaderLogos,
  ]);

  const handleStart = () => {
    if (containerRef.current) {
      runButtonClickEffect(event.buttonClickEffect, { target: containerRef.current });
    }
    onStart();
  };

  const hasHeaderLogos = !!(event.splashHeaderLogos && event.splashHeaderLogos.length > 0);

  const title = event.splashTitle?.trim() ? event.splashTitle : DEFAULT_TITLE;
  const titleLines = title.split("\n").map((l) => l.trim()).filter(Boolean);
  const titleColor = event.splashTitleColor || DEFAULT_TITLE_COLOR;
  const titleFont = resolveSplashFont(event.splashTitleFont, "title");
  // El look "cursiva"/inclinado del título de texto (independiente de la
  // fuente elegida) es un skewX fijo — configurable por evento, 0 = recto.
  // Por compatibilidad, sin este campo se mantiene el -9° original.
  const titleSkewDeg = event.splashTitleSkewDeg ?? -9;
  // Con "IMAGE" pero sin imagen cargada, se cae de vuelta a texto en vez de
  // dejar el título vacío.
  const titleIsImage = event.splashTitleMode === "IMAGE" && !!event.splashTitleImage;

  const subtitle = event.splashSubtitle?.trim() || DEFAULT_SUBTITLE;
  const subtitleColor = event.splashSubtitleColor || DEFAULT_SUBTITLE_COLOR;
  // Los dos toggles siguen la misma regla — "un evento ya creado no puede
  // cambiar de look solo porque apareció un campo nuevo" — pero eso da
  // defaults OPUESTOS, porque el punto de partida de cada texto es distinto:
  //
  //  - Subtítulo: iba forzado a mayúsculas por código -> default ACTIVO
  //    (`!== false`), solo un false explícito lo deja literal.
  //  - Título: nunca tuvo text-transform, se mostraba tal cual -> default
  //    INACTIVO (`=== true`), solo un true explícito lo pasa a mayúsculas.
  const subtitleTransform =
    event.splashSubtitleUppercase !== false ? "uppercase" : "none";
  const titleTransform = event.splashTitleUppercase === true ? "uppercase" : "none";
  const subtitleFont = resolveSplashFont(event.splashSubtitleFont, "subtitle");
  const wordsFont = resolveSplashFont(event.splashWordsFont, "title");

  // Sin fallback a "ARTE"/"COLOR": si el evento no configuró la palabra (o la
  // dejó en blanco), no se muestra nada — antes con el default, todo evento
  // sin estas palabras configuradas mostraba "ARTE"/"COLOR" igual, aunque no
  // tuviera nada que ver con esa marca.
  const word1 = event.splashWord1?.trim() || "";
  const word1Color = event.splashWord1Color || DEFAULT_WORD1_COLOR;
  const word2 = event.splashWord2?.trim() || "";
  const word2Color = event.splashWord2Color || DEFAULT_WORD2_COLOR;

  const loaderFrom = event.splashLoaderColorFrom || DEFAULT_LOADER_FROM;
  const loaderTo = event.splashLoaderColorTo || DEFAULT_LOADER_TO;

  const buttonText = event.splashButtonText?.trim() || DEFAULT_BUTTON_TEXT;
  const buttonFrom = event.splashButtonColorFrom || DEFAULT_BUTTON_FROM;
  const buttonTo = event.splashButtonColorTo || DEFAULT_BUTTON_TO;

  // Barra de carga + botón: se comparte igual en los dos modos (video y
  // animación CSS), solo cambia cómo se posiciona el contenedor — en modo
  // video queda como "pie de página" flotante sobre el video (absolute
  // bottom), en modo animación es la última área del grid (splash-area-action
  // en globals.css, ver ahí la distribución con align-content: space-between).
  const footer = (
    <div
      className={
        isVideoMode
          ? "splash-anim-loaderbar absolute inset-x-0 bottom-0 z-10 flex flex-col items-center"
          : "splash-anim-loaderbar w-full flex flex-col items-center splash-area-action"
      }
      style={
        isVideoMode
          ? {
              gap: 12,
              padding:
                "clamp(1.5rem, 6vh, 3rem) clamp(1.1rem, 5vmin, 2rem) max(1.6rem, env(safe-area-inset-bottom))",
            }
          : { gap: 12 }
      }
    >
      <div
        className="relative splash-loader-track"
        style={{
          width: "clamp(140px, 42vmin, 220px)",
          height: "clamp(7px, 1.6vmin, 10px)",
          borderRadius: 999,
          background: "rgba(120,80,10,.18)",
        }}
      >
        <div
          className="splash-anim-fill relative h-full"
          style={{
            borderRadius: 999,
            background: `linear-gradient(90deg, ${loaderFrom}, ${loaderTo})`,
          }}
        >
          <div
            className="splash-anim-drop absolute"
            style={{
              right: -3,
              top: 6,
              width: 9,
              height: 12,
              borderRadius: "0 0 50% 50%",
              background: loaderTo,
            }}
            aria-hidden
          />
        </div>
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={(e) => {
          e.stopPropagation();
          handleStart();
        }}
        aria-label={buttonText}
        className={`splash-button splash-anim-button border-0 uppercase ${
          ready ? "cursor-pointer" : "pointer-events-none"
        }`}
        style={{
          padding: "clamp(0.7rem, 2.4vmin, 1rem) clamp(1.4rem, 6vmin, 2.2rem)",
          borderRadius: 999,
          background: `linear-gradient(180deg, ${buttonFrom}, ${buttonTo})`,
          color: "#fff",
          fontFamily: "var(--font-splash-anton), sans-serif",
          fontSize: "clamp(1rem, 4vmin, 1.5rem)",
          letterSpacing: "1.6px",
          boxShadow: "0 10px 0 rgba(0,0,0,.35), 0 18px 30px rgba(0,0,0,.28)",
        }}
      >
        {buttonText}
      </button>
    </div>
  );

  // Layout libre (splashFreeLayoutEnabled): título/subtítulo/palabras/tarjeta/
  // barra/botón se posicionan vía FreePositioned en vez del grid responsivo.
  // No aplica en modo video (ahí esos elementos no se muestran igual —
  // el video reemplaza toda la coreografía, ver arriba).
  //
  // Fullscreen sin barras de relleno, en cualquier proporción de pantalla
  // (celular, tablet, desktop, TV): el contenedor raíz (containerType:size)
  // mide el viewport real, y los tamaños de fuente/ancho de cada elemento
  // usan unidades de container query (cqw) calculadas con la MISMA
  // proporción (px del editor / 260) que usa el preview del admin en
  // SplashLayoutEditor.tsx. Eso mantiene cada elemento fiel a su tamaño
  // relativo al ANCHO de pantalla sin importar cuál sea — lo que se estira o
  // encoge según la pantalla real es el espacio VERTICAL entre elementos
  // (xPct/yPct siguen siendo % del viewport completo), no el tamaño de cada
  // uno. Es una decisión consciente (vs. dejar barras de letterbox): en
  // pantallas muy distintas a un celular vertical la separación entre
  // elementos puede verse más ajustada o más suelta que en el editor.
  const freeLayoutOn = !isVideoMode && event.splashFreeLayoutEnabled === true;

  if (freeLayoutOn) {
    const barNode = (
      <div
        className="splash-anim-loaderbar relative splash-loader-track"
        style={{
          width: wide ? "52cqw" : "34.62cqw",
          height: wide ? "3.46cqw" : "2.31cqw",
          borderRadius: 999,
          background: "rgba(120,80,10,.18)",
        }}
      >
        <div
          className="splash-anim-fill relative h-full"
          style={{
            borderRadius: 999,
            background: `linear-gradient(90deg, ${loaderFrom}, ${loaderTo})`,
          }}
        >
          <div
            className="splash-anim-drop absolute"
            style={{
              right: wide ? "-1.7cqw" : "-1.15cqw",
              top: wide ? "3.46cqw" : "2.3cqw",
              width: wide ? "5.2cqw" : "3.46cqw",
              height: wide ? "6.9cqw" : "4.6cqw",
              borderRadius: "0 0 50% 50%",
              background: loaderTo,
            }}
            aria-hidden
          />
        </div>
      </div>
    );

    const buttonNode = (
      <button
        type="button"
        disabled={!ready}
        onClick={(e) => {
          e.stopPropagation();
          handleStart();
        }}
        aria-label={buttonText}
        className={`splash-button splash-anim-button border-0 uppercase whitespace-nowrap ${
          ready ? "cursor-pointer" : "pointer-events-none"
        }`}
        style={{
          padding: wide ? "2.9cqw 6.9cqw" : "1.92cqw 4.62cqw",
          borderRadius: 999,
          background: `linear-gradient(180deg, ${buttonFrom}, ${buttonTo})`,
          color: "#fff",
          fontFamily: "var(--font-splash-anton), sans-serif",
          fontSize: wide ? "5.2cqw" : "3.46cqw",
          letterSpacing: "1.6px",
          boxShadow: "0 10px 0 rgba(0,0,0,.35), 0 18px 30px rgba(0,0,0,.28)",
        }}
      >
        {buttonText}
      </button>
    );

    const titleNode = (
      <div
        className="flex flex-col items-center"
        style={titleIsImage ? undefined : { gap: 2, fontFamily: titleFont }}
      >
        {titleIsImage ? (
          <img
            src={event.splashTitleImage}
            alt={event.name}
            draggable={false}
            style={{
              width: wide ? "52cqw" : "38.46cqw",
              height: "auto",
              filter: "drop-shadow(0 6px 14px rgba(0,0,0,.28))",
            }}
          />
        ) : (
          titleLines.map((line, i) => (
            <div
              key={i}
              className={`splash-title-line ${
                i === 0 ? "splash-anim-slideL" : i === 1 ? "splash-anim-slideR" : "splash-anim-subtitle"
              }`}
              style={
                {
                  fontSize: "8.46cqw",
                  lineHeight: 0.94,
                  letterSpacing: "0.5px",
                  textTransform: titleTransform,
                  color: titleColor,
                  // Fallback para prefers-reduced-motion (sin animación
                  // corriendo, este transform inline es el que manda) — con
                  // animación activa, manda la variable CSS de abajo (ver
                  // comentario en @keyframes splash-slideL/R en globals.css).
                  transform: `skewX(${titleSkewDeg}deg)`,
                  "--title-skew": `${titleSkewDeg}deg`,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  textShadow: "0 3px 0 rgba(255,255,255,.5), 0 10px 22px rgba(0,0,0,.22)",
                } as React.CSSProperties
              }
            >
              {line}
            </div>
          ))
        )}
      </div>
    );

    const subtitleNode = (
      <div
        className="splash-anim-subtitle text-center"
        style={{
          fontFamily: subtitleFont,
          fontWeight: 800,
          fontSize: "3.85cqw",
          letterSpacing: "0.6px",
          textTransform: subtitleTransform,
          color: subtitleColor,
          whiteSpace: "nowrap",
        }}
      >
        {subtitle}
      </div>
    );

    const cardNode = event.splashCardImage ? (
      <div className="relative" style={{ width: wide ? "48cqw" : "34.62cqw" }}>
        <div className="splash-anim-card relative">
          <div
            className="splash-anim-halo absolute pointer-events-none"
            style={{
              inset: "-14%",
              borderRadius: "16%",
              background: "radial-gradient(circle, rgba(255,255,255,.75), rgba(255,255,255,0) 68%)",
            }}
            aria-hidden
          />
          <div
            className="relative overflow-hidden"
            style={{
              borderRadius: "11%",
              boxShadow: "0 22px 44px rgba(150,95,0,.3), inset 0 0 0 1px rgba(255,255,255,.45)",
            }}
          >
            <img
              src={event.splashCardImage}
              alt={event.name}
              draggable={false}
              className="splash-anim-bob block w-full h-auto"
            />
            <div
              className="splash-anim-sheen absolute pointer-events-none"
              style={{
                top: 0,
                left: 0,
                width: "60%",
                height: "130%",
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.5), rgba(255,255,255,0))",
              }}
              aria-hidden
            />
          </div>
        </div>
      </div>
    ) : null;

    const wordNodeStyle = (color: string, rotate: number): React.CSSProperties => ({
      fontFamily: wordsFont,
      fontSize: "6.15cqw",
      lineHeight: 0.95,
      color,
      transform: `rotate(${rotate}deg)`,
      textShadow: "0 2px 0 rgba(255,255,255,.5)",
      whiteSpace: "nowrap",
    });

    return (
      <div
        ref={containerRef}
        onClick={ready ? handleStart : undefined}
        className={`fixed inset-0 overflow-hidden select-none ${anton.variable} ${barlowCondensed.variable} ${roboto.variable}`}
        style={
          {
            cursor: ready ? "pointer" : "default",
            width: "100dvw",
            height: "100dvh",
          } as React.CSSProperties
        }
      >
        {bgVideoUrl ? (
          <>
            <video
              key={bgVideoUrl}
              src={bgVideoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              aria-hidden
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,.1) 45%, rgba(0,0,0,.55) 100%)",
              }}
              aria-hidden
            />
          </>
        ) : event.bgImage ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${event.bgImage}')` }}
              aria-hidden
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,.1) 45%, rgba(0,0,0,.55) 100%)",
              }}
              aria-hidden
            />
          </>
        ) : (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 42%, #FFE79A 0%, #FDD962 45%, #F7C63F 100%)",
            }}
            aria-hidden
          >
            <div
              className="splash-anim-blob1 absolute rounded-full"
              style={{
                top: "-12%",
                left: "-22%",
                width: "58%",
                aspectRatio: "1 / 1",
                background: "radial-gradient(circle at 40% 40%, #EC0C7B, #C2076A)",
                filter: "blur(24px)",
                opacity: 0.85,
              }}
            />
            <div
              className="splash-anim-blob2 absolute rounded-full"
              style={{
                top: "15%",
                right: "-20%",
                width: "50%",
                aspectRatio: "1 / 1",
                background: "radial-gradient(circle at 45% 45%, #2FC3C9, #17A8B4)",
                filter: "blur(28px)",
                opacity: 0.6,
              }}
            />
            <div
              className="splash-anim-blob3 absolute rounded-full"
              style={{
                bottom: "-10%",
                left: "-18%",
                width: "55%",
                aspectRatio: "1 / 1",
                background: "radial-gradient(circle at 50% 40%, #A45BD6, #7C3FB0)",
                filter: "blur(32px)",
                opacity: 0.5,
              }}
            />
            <div
              className="splash-anim-blob4 absolute rounded-full"
              style={{
                bottom: "8%",
                right: "-10%",
                width: "36%",
                aspectRatio: "1 / 1",
                background: "radial-gradient(circle at 50% 40%, #2FC3C9, #1B9AA6)",
                filter: "blur(26px)",
                opacity: 0.45,
              }}
            />
          </div>
        )}

        {/* Escenario acotado a la relación de aspecto de referencia del
            editor (SPLASH_STAGE_ASPECT_RATIO) y centrado horizontalmente —
            el fondo de arriba sigue ocupando el 100% de la pantalla (sin
            barras de letterbox), pero el CONTENIDO posicionado libremente
            (xPct/yPct + tamaños en cqw) queda acotado a ese ancho máximo, así
            en pantallas mucho más anchas que un celular (tablets como
            1024×1366, TV, desktop) no se ve desproporcionadamente grande ni
            corrido del centro — antes `containerType:size` medía el ancho
            REAL del viewport sin techo, así que cqw crecía más de lo
            calibrado en el editor en cualquier pantalla más "cuadrada" que
            una vertical de celular. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            style={
              {
                position: "relative",
                height: "100%",
                width: `min(100dvw, calc(100dvh * ${SPLASH_STAGE_ASPECT_RATIO}))`,
                containerType: "size",
              } as React.CSSProperties
            }
          >
        {hasHeaderLogos
          ? event.splashHeaderLogos!.map((logo, i) => {
              const pos =
                event.splashLayout?.logos?.[logo.id] ||
                { xPct: 5 + i * 30, yPct: 3, scalePct: 100 };
              return (
                <div
                  key={logo.id}
                  style={{
                    position: "absolute",
                    left: `${pos.xPct}%`,
                    top: `${pos.yPct}%`,
                    transform: `scale(${pos.scalePct / 100})`,
                    transformOrigin: "top left",
                  }}
                >
                  <img
                    src={logo.url}
                    alt={event.name}
                    draggable={false}
                    className="splash-anim-logo"
                    style={{
                      width: wide ? "24cqw" : "16.92cqw",
                      height: "auto",
                      filter: "drop-shadow(0 6px 10px rgba(150,90,0,.28))",
                    }}
                  />
                </div>
              );
            })
          : event.logoTop && (
              <FreePositioned event={event} kind="logo">
                <img
                  src={event.logoTop}
                  alt={event.name}
                  draggable={false}
                  className="splash-anim-logo"
                  style={{
                    width: wide ? "24cqw" : "16.92cqw",
                    height: "auto",
                    filter: "drop-shadow(0 6px 10px rgba(150,90,0,.28))",
                  }}
                />
              </FreePositioned>
            )}

        <FreePositioned event={event} kind="title">
          {titleNode}
        </FreePositioned>
        <FreePositioned event={event} kind="subtitle">
          {subtitleNode}
        </FreePositioned>
        {cardNode && (
          <FreePositioned event={event} kind="card">
            {cardNode}
          </FreePositioned>
        )}
        {word1 && (
          <FreePositioned event={event} kind="word1">
            <div className="splash-anim-word1" style={wordNodeStyle(word1Color, -16)}>
              {word1}
            </div>
          </FreePositioned>
        )}
        {word2 && (
          <FreePositioned event={event} kind="word2">
            <div className="splash-anim-word2" style={wordNodeStyle(word2Color, -14)}>
              {word2}
            </div>
          </FreePositioned>
        )}
        {wide ? (
          // Los xPct/yPct de "bar"/"button" (ver SPLASH_FREE_LAYOUT_DEFAULTS)
          // están pensados para un celular vertical - en la pantalla ancha
          // dejan ambos corridos hacia la izquierda en vez de centrados. Acá
          // se centran horizontalmente de verdad, en vez de usar
          // FreePositioned (que solo posiciona por left/top absolutos).
          <div className="absolute inset-x-0 bottom-[6%] flex flex-col items-center gap-4">
            {barNode}
            {buttonNode}
          </div>
        ) : (
          <>
            <FreePositioned event={event} kind="bar">
              {barNode}
            </FreePositioned>
            <FreePositioned event={event} kind="button">
              {buttonNode}
            </FreePositioned>
          </>
        )}
          </div>
        </div>
      </div>
    );
  }

  if (isVideoMode) {
    return (
      <div
        ref={containerRef}
        className={`fixed inset-0 overflow-hidden select-none ${anton.variable} ${barlowCondensed.variable} ${roboto.variable}`}
      >
        <MediaTapScreen videoUrl={effectiveVideoUrl} onTap={handleStart} videoObjectFit={wide ? "cover" : "contain"}>
          {/* Velo inferior: legibilidad de la barra/botón sobre un video cuyo
              contenido no se controla (podría ser claro justo ahí abajo). */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: "45%",
              background: "linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,0) 100%)",
            }}
            aria-hidden
          />
          {footer}
        </MediaTapScreen>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={ready ? handleStart : undefined}
      className={`fixed inset-0 overflow-hidden select-none ${anton.variable} ${barlowCondensed.variable} ${roboto.variable}`}
      style={{ cursor: ready ? "pointer" : "default" }}
    >
      {/* Fondo: la imagen de fondo del evento (misma que el resto del flujo);
          si no hay ninguna configurada, degradado + manchas de color de
          referencia del handoff, para que el splash nunca se vea vacío. */}
      {bgVideoUrl ? (
        <>
          <video
            key={bgVideoUrl}
            src={bgVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,.1) 45%, rgba(0,0,0,.55) 100%)",
            }}
            aria-hidden
          />
        </>
      ) : event.bgImage ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${event.bgImage}')` }}
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,.1) 45%, rgba(0,0,0,.55) 100%)",
            }}
            aria-hidden
          />
        </>
      ) : (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 42%, #FFE79A 0%, #FDD962 45%, #F7C63F 100%)",
          }}
          aria-hidden
        >
          <div
            className="splash-anim-blob1 absolute rounded-full"
            style={{
              top: "-12%",
              left: "-22%",
              width: "58%",
              aspectRatio: "1 / 1",
              background: "radial-gradient(circle at 40% 40%, #EC0C7B, #C2076A)",
              filter: "blur(24px)",
              opacity: 0.85,
            }}
          />
          <div
            className="splash-anim-blob2 absolute rounded-full"
            style={{
              top: "15%",
              right: "-20%",
              width: "50%",
              aspectRatio: "1 / 1",
              background: "radial-gradient(circle at 45% 45%, #2FC3C9, #17A8B4)",
              filter: "blur(28px)",
              opacity: 0.6,
            }}
          />
          <div
            className="splash-anim-blob3 absolute rounded-full"
            style={{
              bottom: "-10%",
              left: "-18%",
              width: "55%",
              aspectRatio: "1 / 1",
              background: "radial-gradient(circle at 50% 40%, #A45BD6, #7C3FB0)",
              filter: "blur(32px)",
              opacity: 0.5,
            }}
          />
          <div
            className="splash-anim-blob4 absolute rounded-full"
            style={{
              bottom: "8%",
              right: "-10%",
              width: "36%",
              aspectRatio: "1 / 1",
              background: "radial-gradient(circle at 50% 40%, #2FC3C9, #1B9AA6)",
              filter: "blur(26px)",
              opacity: 0.45,
            }}
          />
        </div>
      )}

      {/* Columna de contenido: grid con áreas nombradas (splash-grid en
          globals.css) en vez de un simple flex-col, para poder reacomodar
          logo/título/subtítulo/tarjeta/acción a dos columnas cuando el alto
          disponible es corto (celular en horizontal) sin tocar el layout
          vertical por defecto. */}
      <div
        className="splash-grid relative h-full w-full"
        style={{
          padding:
            "max(2rem, env(safe-area-inset-top)) clamp(1.1rem, 5vmin, 2rem) max(1.6rem, env(safe-area-inset-bottom))",
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {hasHeaderLogos ? (
          <div
            className="splash-anim-logo splash-header-multi"
            style={{ height: `${event.splashHeaderHeightPct ?? 18}vh` }}
          >
            {event.splashHeaderLogos!.map((logo) => (
              <img
                key={logo.id}
                src={logo.url}
                alt={event.name}
                draggable={false}
                style={{
                  position: "absolute",
                  left: `${logo.xPct}%`,
                  top: `${logo.yPct}%`,
                  width: `${logo.widthPct}%`,
                  height: "auto",
                  filter: "drop-shadow(0 6px 10px rgba(150,90,0,.28))",
                }}
              />
            ))}
          </div>
        ) : (
          event.logoTop && (
            <img
              src={event.logoTop}
              alt={event.name}
              draggable={false}
              className="splash-anim-logo splash-area-logo"
              style={{
                width: "clamp(90px, 22vmin, 160px)",
                height: "auto",
                filter: "drop-shadow(0 6px 10px rgba(150,90,0,.28))",
              }}
            />
          )
        )}

        <div
          className="flex flex-col items-center splash-area-title"
          style={titleIsImage ? undefined : { gap: 2, fontFamily: titleFont }}
        >
          {titleIsImage ? (
            <img
              src={event.splashTitleImage}
              alt={event.name}
              draggable={false}
              className="splash-anim-slideL"
              style={{
                maxWidth: wide ? "min(70vw, 900px)" : "min(84vw, 480px)",
                width: "100%",
                height: "auto",
                filter: "drop-shadow(0 6px 14px rgba(0,0,0,.28))",
              }}
            />
          ) : (
            titleLines.map((line, i) => (
              <div
                key={i}
                className={`splash-title-line ${
                  i === 0 ? "splash-anim-slideL" : i === 1 ? "splash-anim-slideR" : "splash-anim-subtitle"
                }`}
                style={
                  {
                    fontSize: "clamp(1.9rem, 9vmin, 3.6rem)",
                    lineHeight: 0.94,
                    letterSpacing: "0.5px",
                    textTransform: titleTransform,
                    color: titleColor,
                    // Fallback para prefers-reduced-motion; con animación
                    // activa manda --title-skew (ver globals.css).
                    transform: `skewX(${titleSkewDeg}deg)`,
                    "--title-skew": `${titleSkewDeg}deg`,
                    textAlign: "center",
                    textShadow:
                      "0 3px 0 rgba(255,255,255,.5), 0 10px 22px rgba(0,0,0,.22)",
                  } as React.CSSProperties
                }
              >
                {line}
              </div>
            ))
          )}
        </div>

        <div
          className="splash-anim-subtitle text-center splash-area-subtitle"
          style={{
            fontFamily: subtitleFont,
            fontWeight: 800,
            fontSize: "clamp(0.95rem, 4vmin, 1.6rem)",
            letterSpacing: "0.6px",
            textTransform: subtitleTransform,
            color: subtitleColor,
          }}
        >
          {subtitle}
        </div>

        {event.splashCardImage && (
          <div
            className="relative splash-area-card"
            style={
              {
                width: "var(--splash-card-w)",
                "--splash-card-w": "clamp(190px, 46vmin, 300px)",
              } as React.CSSProperties
            }
          >
            <div className="splash-anim-card relative">
              <div
                className="splash-anim-halo absolute pointer-events-none"
                style={{
                  inset: "-14px",
                  borderRadius: 40,
                  background: "radial-gradient(circle, rgba(255,255,255,.75), rgba(255,255,255,0) 68%)",
                }}
                aria-hidden
              />
              <div
                className="relative overflow-hidden"
                style={{
                  borderRadius: 30,
                  boxShadow: "0 22px 44px rgba(150,95,0,.3), inset 0 0 0 1px rgba(255,255,255,.45)",
                }}
              >
                <img
                  src={event.splashCardImage}
                  alt={event.name}
                  draggable={false}
                  className="splash-anim-bob block w-full h-auto"
                />
                <div
                  className="splash-anim-sheen absolute pointer-events-none"
                  style={{
                    top: 0,
                    left: 0,
                    width: "60%",
                    height: "130%",
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.5), rgba(255,255,255,0))",
                  }}
                  aria-hidden
                />
              </div>
            </div>

            {word1 && (
              <div
                className="splash-anim-word1 absolute"
                style={{
                  left: "-14%",
                  top: "-9%",
                  fontFamily: wordsFont,
                  fontSize: `calc(var(--splash-card-w) * ${wordFontFactor(word1)})`,
                  lineHeight: 0.95,
                  color: word1Color,
                  transform: "rotate(-16deg)",
                  textShadow: "0 2px 0 rgba(255,255,255,.5)",
                  maxWidth: "min(46vw, 220px)",
                  whiteSpace: "normal",
                  overflowWrap: "break-word",
                  textAlign: "left",
                }}
                aria-hidden
              >
                {word1}
              </div>
            )}
            {word2 && (
              <div
                className="splash-anim-word2 absolute"
                style={{
                  right: "-17%",
                  top: "20%",
                  fontFamily: wordsFont,
                  fontSize: `calc(var(--splash-card-w) * ${wordFontFactor(word2)})`,
                  lineHeight: 0.95,
                  color: word2Color,
                  transform: "rotate(-14deg)",
                  textShadow: "0 2px 0 rgba(255,255,255,.5)",
                  maxWidth: "min(46vw, 220px)",
                  whiteSpace: "normal",
                  overflowWrap: "break-word",
                  textAlign: "right",
                }}
                aria-hidden
              >
                {word2}
              </div>
            )}
          </div>
        )}

        {footer}
      </div>
    </div>
  );
}
