/* eslint-disable @next/next/no-img-element */
// app/components/ButtonPrimary.tsx
"use client";

import React, { useRef, useState } from "react";
import { runButtonClickEffect, type ButtonClickEffectId } from "@/app/components/common/click-effects";
import { anton } from "@/app/components/photo-booth/SplashScreen";

const DEFAULT_COLOR_FROM = "#F2143C";
const DEFAULT_COLOR_TO = "#C40024";

type ButtonPrimaryProps = {
  onClick?: () => void;
  label?: string;
  /**
   * Imagen de fondo del botón (branding a medida por evento). Si no se pasa,
   * el botón usa el mismo diseño que el CTA de la splash: píldora con
   * degradado (colorFrom/colorTo) + fuente Anton — ver `EventProfile.buttonImage`.
   */
  imageSrc?: string;
  /** Degradado (arriba→abajo) cuando no hay imageSrc. Mismos defaults que el botón de la splash. */
  colorFrom?: string;
  colorTo?: string;
  /** Ancho y alto del botón (px, rem, %, etc.). Ej: 192, "12rem", "50%" */
  width?: number | string;
  height?: number | string;
  className?: string; // clases extra para el <button>
  textClassName?: string; // clases extra para el <span> (texto)
  /** Estilos inline extra para el <span> (texto). A diferencia de
   * `textClassName`, esto tiene prioridad garantizada sobre CUALQUIER clase
   * (incluida la de tamaño de fuente hardcodeada acá abajo) porque un style
   * inline siempre gana por especificidad — pensado para tamaños grandes
   * tipo clamp() en pantallas gigantes, donde los breakpoints fijos de
   * Tailwind (que topean en `lg:` = 1024px, sin variante más grande) se
   * quedan chicos en 1920px y compiten con `textClassName` sin garantía de
   * cuál gana. */
  textStyle?: React.CSSProperties;
  disabled?: boolean;
  ariaLabel?: string;
  /** Animación disparada al hacer click (configurable por evento). Default "NONE". */
  clickEffect?: ButtonClickEffectId;
};

export default function ButtonPrimary({
  onClick,
  label = "EMPEZAR",
  imageSrc,
  colorFrom = DEFAULT_COLOR_FROM,
  colorTo = DEFAULT_COLOR_TO,
  width = 192,
  height = 64,
  className = "",
  textClassName = "",
  textStyle,
  disabled = false,
  ariaLabel,
  clickEffect = "NONE",
}: ButtonPrimaryProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    if (buttonRef.current) {
      runButtonClickEffect(clickEffect, { target: buttonRef.current });
    }
    onClick?.();
  };
  // Función para normalizar width/height a string CSS válido
  const normalizeSize = (size: number | string): string => {
    if (typeof size === "number") {
      return `${size}px`;
    }
    return size;
  };

  const widthStyle = normalizeSize(width);
  const heightStyle = normalizeSize(height);
  const isPressedLook = pressed && !disabled;

  const commonProps = {
    ref: buttonRef,
    onClick: handleClick,
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    disabled,
    "aria-label": ariaLabel || label,
  };

  // Con imageSrc: branding a medida por evento (imagen propia como fondo del
  // botón). La FORMA del botón la da la imagen (normalmente un PNG con
  // transparencia: píldora, botón ilustrado, etc.), no la caja del <button>.
  // Por eso nada de lo que se dibuja acá puede depender de esa caja:
  // - La sombra va como `filter: drop-shadow` sobre la imagen, que sigue su
  //   canal alfa. Antes era `box-shadow` sobre el <button> (un rectángulo sin
  //   redondeo): alrededor de la imagen se veía un recuadro sombreado y, por
  //   la sombra dura de 4px, una línea oscura debajo.
  // - Se quitó el brillo superior (degradado blanco a `inset-0`): cubría la
  //   caja entera, así que sobre las zonas transparentes del PNG se veía como
  //   un recuadro blanco semitransparente.
  if (imageSrc) {
    const imageShadow = disabled
      ? "none"
      : isPressedLook
        ? "drop-shadow(0 1px 0 rgba(0,0,0,0.35)) drop-shadow(0 2px 4px rgba(0,0,0,0.35))"
        : "drop-shadow(0 4px 0 rgba(0,0,0,0.35)) drop-shadow(0 8px 10px rgba(0,0,0,0.35))";
    return (
      <button
        {...commonProps}
        className={[
          "relative flex items-center justify-center select-none",
          "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          "transition-transform duration-100 ease-out",
          pressed ? "translate-y-[3px]" : "hover:brightness-105",
          "disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0",
          className,
        ].join(" ")}
        style={{ width: widthStyle, height: heightStyle }}
      >
        <img
          src={imageSrc}
          alt={label}
          className="absolute w-full h-full object-cover rounded-[14px] transition-[filter] duration-100 ease-out"
          style={{ filter: imageShadow }}
          draggable={false}
        />
        <span
          className={[
            "relative z-10",
            "font-azo text-white font-bold",
            "text-xs sm:text-sm md:text-xl lg:text-lg",
            "drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]",
            textClassName,
          ].join(" ")}
          style={textStyle}
        >
          {label}
        </span>
      </button>
    );
  }

  // Sin imageSrc (default): mismo diseño que el CTA "Toca para comenzar" de
  // la splash — píldora con degradado configurable + Anton + sombra dura
  // tipo "tecla", presionable. `anton.variable` acá adentro porque estas
  // pantallas no viven dentro de SplashScreen (esa variable de fuente no
  // llega sola).
  return (
    <button
      {...commonProps}
      className={[
        anton.variable,
        "relative flex items-center justify-center select-none border-0",
        "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        "transition-transform duration-150 ease-out",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:brightness-105",
        // Palpito en loop, igual que el CTA de la splash — pausado mientras
        // está presionado para no pelear visualmente con el translateY del
        // estado "hundido".
        !disabled && !isPressedLook ? "animate-buttonPrimaryPulse" : "",
        className,
      ].join(" ")}
      style={{
        width: widthStyle,
        height: heightStyle,
        borderRadius: 999,
        background: `linear-gradient(180deg, ${colorFrom}, ${colorTo})`,
        transform: isPressedLook ? "translateY(6px)" : undefined,
        boxShadow: disabled
          ? "none"
          : isPressedLook
            ? "0 4px 0 rgba(0,0,0,.35), 0 10px 18px rgba(0,0,0,.22)"
            : "0 10px 0 rgba(0,0,0,.35), 0 18px 30px rgba(0,0,0,.28)",
      }}
    >
      <span
        className={[
          "relative z-10 uppercase",
          "text-white font-bold",
          "text-xs sm:text-sm md:text-xl lg:text-lg",
          textClassName,
        ].join(" ")}
        style={{ fontFamily: "var(--font-splash-anton), sans-serif", letterSpacing: "1.6px", ...textStyle }}
      >
        {label}
      </span>
    </button>
  );
}
