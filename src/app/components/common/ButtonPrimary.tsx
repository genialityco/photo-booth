/* eslint-disable @next/next/no-img-element */
// app/components/ButtonPrimary.tsx
"use client";

import React, { useRef, useState } from "react";
import { runButtonClickEffect, type ButtonClickEffectId } from "@/app/components/common/click-effects";

type ButtonPrimaryProps = {
  onClick?: () => void;
  label?: string;
  imageSrc?: string;
  /** Ancho y alto del botón (px, rem, %, etc.). Ej: 192, "12rem", "50%" */
  width?: number | string;
  height?: number | string;
  className?: string; // clases extra para el <button>
  textClassName?: string; // clases extra para el <span> (texto)
  disabled?: boolean;
  ariaLabel?: string;
  /** Animación disparada al hacer click (configurable por evento). Default "NONE". */
  clickEffect?: ButtonClickEffectId;
};

export default function ButtonPrimary({
  onClick,
  label = "EMPEZAR",
  imageSrc = "/images/btn_principal.png",
  width = 192,
  height = 64,
  className = "",
  textClassName = "",
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

  // Las imágenes de botón (ej. BOTON-COMENZAR.png) suelen ser un rectángulo
  // de color plano sin ningún relieve propio, así que el 3D lo ponemos acá:
  // un borde inferior duro (sin blur, tipo "canto" de una tecla física) +
  // una sombra difusa por debajo para elevarlo del fondo, y al presionar
  // (pointer down) el botón "baja" hacia su propio canto — mismo patrón de
  // pressed state que ShutterButton.
  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      aria-label={ariaLabel || label}
      className={[
        // base layout
        "relative flex items-center justify-center select-none",
        // visual
        "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        // animación "presionar"
        "transition-all duration-100 ease-out",
        pressed
          ? "translate-y-[3px] shadow-[0_1px_0_0_rgba(0,0,0,0.35),0_2px_6px_-1px_rgba(0,0,0,0.4)]"
          : "shadow-[0_4px_0_0_rgba(0,0,0,0.35),0_10px_20px_-6px_rgba(0,0,0,0.5)] hover:brightness-105",
        // disabled
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0",
        className,
      ].join(" ")}
      style={{ width: widthStyle, height: heightStyle }}
    >
      <img
        src={imageSrc}
        alt={label}
        className="absolute w-full h-full object-cover rounded-[14px]"
        draggable={false}
      />
      {/* Brillo superior: da sensación de superficie curva en vez de plana */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[14px] bg-gradient-to-b from-white/35 via-white/0 to-black/10"
      />
      <span
        className={[
          "relative z-10",
          "font-azo text-white font-bold",
          "text-xs sm:text-sm md:text-xl lg:text-lg",
          "drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]",
          textClassName,
        ].join(" ")}
      >
        {label}
      </span>
    </button>
  );
}
