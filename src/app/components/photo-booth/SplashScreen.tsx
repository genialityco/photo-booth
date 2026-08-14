/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Anton, Barlow_Condensed } from "next/font/google";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import { runButtonClickEffect } from "@/app/components/common/click-effects";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-splash-anton",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  weight: ["700", "800"],
  subsets: ["latin"],
  variable: "--font-splash-barlow",
  display: "swap",
});

const DEFAULT_TITLE = "TU ROSTRO,\nTU ARTE";
const DEFAULT_TITLE_COLOR = "#E4032E";
const DEFAULT_SUBTITLE = "Conviértete en una obra de arte";
const DEFAULT_SUBTITLE_COLOR = "#2B2118";
const DEFAULT_WORD1 = "ARTE";
const DEFAULT_WORD1_COLOR = "#1FB6C4";
const DEFAULT_WORD2 = "COLOR";
const DEFAULT_WORD2_COLOR = "#F0369A";
const DEFAULT_LOADER_FROM = "#F7A600";
const DEFAULT_LOADER_TO = "#E4032E";
const DEFAULT_BUTTON_TEXT = "Toca para comenzar";
const DEFAULT_BUTTON_FROM = "#F2143C";
const DEFAULT_BUTTON_TO = "#C40024";

export default function SplashScreen({
  event,
  onStart,
}: {
  event: EventProfile;
  onStart: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  // La coreografía visual (logo → título → ... → botón) es un loop CSS
  // infinito, independiente de esto: acá solo se resuelve cuándo la pantalla
  // pasa a ser realmente tappable (assets visibles ya cargados), para no
  // dejar tocar antes de que el fondo/logo/tarjeta estén listos.
  useEffect(() => {
    let cancelled = false;
    const assets = [event.bgImage, event.logoTop, event.splashCardImage].filter(
      (src): src is string => !!src
    );

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
  }, [event.bgImage, event.logoTop, event.splashCardImage]);

  const handleStart = () => {
    if (containerRef.current) {
      runButtonClickEffect(event.buttonClickEffect, { target: containerRef.current });
    }
    onStart();
  };

  const title = event.splashTitle?.trim() ? event.splashTitle : DEFAULT_TITLE;
  const titleLines = title.split("\n").map((l) => l.trim()).filter(Boolean);
  const titleColor = event.splashTitleColor || DEFAULT_TITLE_COLOR;

  const subtitle = event.splashSubtitle?.trim() || DEFAULT_SUBTITLE;
  const subtitleColor = event.splashSubtitleColor || DEFAULT_SUBTITLE_COLOR;

  const word1 = event.splashWord1?.trim() || DEFAULT_WORD1;
  const word1Color = event.splashWord1Color || DEFAULT_WORD1_COLOR;
  const word2 = event.splashWord2?.trim() || DEFAULT_WORD2;
  const word2Color = event.splashWord2Color || DEFAULT_WORD2_COLOR;

  const loaderFrom = event.splashLoaderColorFrom || DEFAULT_LOADER_FROM;
  const loaderTo = event.splashLoaderColorTo || DEFAULT_LOADER_TO;

  const buttonText = event.splashButtonText?.trim() || DEFAULT_BUTTON_TEXT;
  const buttonFrom = event.splashButtonColorFrom || DEFAULT_BUTTON_FROM;
  const buttonTo = event.splashButtonColorTo || DEFAULT_BUTTON_TO;

  return (
    <div
      ref={containerRef}
      onClick={ready ? handleStart : undefined}
      className={`fixed inset-0 overflow-hidden select-none ${anton.variable} ${barlowCondensed.variable}`}
      style={{ cursor: ready ? "pointer" : "default" }}
    >
      {/* Fondo: la imagen de fondo del evento (misma que el resto del flujo);
          si no hay ninguna configurada, degradado + manchas de color de
          referencia del handoff, para que el splash nunca se vea vacío. */}
      {event.bgImage ? (
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

      {/* Columna de contenido */}
      <div
        className="relative h-full w-full flex flex-col items-center"
        style={{
          padding:
            "max(2rem, env(safe-area-inset-top)) clamp(1.1rem, 5vmin, 2rem) max(1.6rem, env(safe-area-inset-bottom))",
        }}
      >
        {event.logoTop && (
          <img
            src={event.logoTop}
            alt={event.name}
            draggable={false}
            className="splash-anim-logo"
            style={{
              width: "clamp(90px, 22vmin, 160px)",
              height: "auto",
              filter: "drop-shadow(0 6px 10px rgba(150,90,0,.28))",
            }}
          />
        )}

        <div
          className="flex flex-col items-center"
          style={{
            marginTop: "clamp(1rem, 4vmin, 1.7rem)",
            gap: 2,
            fontFamily: "var(--font-splash-anton), sans-serif",
          }}
        >
          {titleLines.map((line, i) => (
            <div
              key={i}
              className={
                i === 0 ? "splash-anim-slideL" : i === 1 ? "splash-anim-slideR" : "splash-anim-subtitle"
              }
              style={{
                fontSize: "clamp(1.9rem, 9vmin, 3.6rem)",
                lineHeight: 0.94,
                letterSpacing: "0.5px",
                color: titleColor,
                transform: "skewX(-9deg)",
                textAlign: "center",
                textShadow:
                  "0 3px 0 rgba(255,255,255,.5), 0 10px 22px rgba(0,0,0,.22)",
              }}
            >
              {line}
            </div>
          ))}
        </div>

        <div
          className="splash-anim-subtitle text-center"
          style={{
            marginTop: "clamp(0.9rem, 3.4vmin, 1.4rem)",
            fontFamily: "var(--font-splash-barlow), sans-serif",
            fontWeight: 800,
            fontSize: "clamp(0.95rem, 4vmin, 1.6rem)",
            letterSpacing: "0.6px",
            textTransform: "uppercase",
            color: subtitleColor,
          }}
        >
          {subtitle}
        </div>

        {event.splashCardImage && (
          <div
            className="relative"
            style={{ marginTop: "clamp(1.2rem, 4.5vmin, 2.1rem)", width: "clamp(190px, 46vmin, 300px)" }}
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
                  fontFamily: "var(--font-splash-anton), sans-serif",
                  fontSize: "clamp(1.1rem, 5vmin, 1.9rem)",
                  color: word1Color,
                  transform: "rotate(-16deg)",
                  textShadow: "0 2px 0 rgba(255,255,255,.5)",
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
                  fontFamily: "var(--font-splash-anton), sans-serif",
                  fontSize: "clamp(1.1rem, 5vmin, 1.9rem)",
                  color: word2Color,
                  transform: "rotate(-14deg)",
                  textShadow: "0 2px 0 rgba(255,255,255,.5)",
                }}
                aria-hidden
              >
                {word2}
              </div>
            )}
          </div>
        )}

        <div
          className="splash-anim-loaderbar w-full flex flex-col items-center"
          style={{ marginTop: "auto", gap: 12 }}
        >
          <div
            className="relative"
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
      </div>
    </div>
  );
}
