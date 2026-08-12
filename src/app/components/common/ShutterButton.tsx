"use client";

import React, { useRef, useState } from "react";
import { runButtonClickEffect, type ButtonClickEffectId } from "@/app/components/common/click-effects";

/**
 * Botón disparador tipo cámara real: anillo blanco + círculo interior, sin
 * texto. Si el evento tiene `buttonImage`, se usa como relleno del círculo
 * interior (toque de marca); si no, queda blanco puro (shutter clásico).
 */
export default function ShutterButton({
  onClick,
  imageSrc,
  disabled = false,
  clickEffect,
  ariaLabel = "Tomar foto",
}: {
  onClick: () => void;
  imageSrc?: string;
  disabled?: boolean;
  clickEffect?: ButtonClickEffectId;
  ariaLabel?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    if (buttonRef.current) {
      runButtonClickEffect(clickEffect, { target: buttonRef.current });
    }
    onClick();
  };

  return (
    <div className="relative w-[72px] h-[72px] sm:w-20 sm:h-20">
      {/* Anillo pulsante: invita a tocar. Se detiene mientras se presiona. */}
      {!disabled && !pressed && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-white/80 animate-shutterPulse pointer-events-none"
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`absolute inset-0 rounded-full border-[4px] border-white shadow-[0_2px_16px_rgba(0,0,0,0.45)] transition-transform duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed select-none ${
          pressed ? "scale-90" : "scale-100"
        }`}
      >
        <span
          className="absolute inset-[6px] rounded-full bg-white bg-cover bg-center"
          style={imageSrc ? { backgroundImage: `url('${imageSrc}')` } : undefined}
        />
      </button>
    </div>
  );
}
