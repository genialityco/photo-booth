// app/components/ButtonPrimary.tsx
"use client";

import React from "react";

type ButtonPrimaryProps = {
    onClick?: () => void;
    label?: string;
    imageSrc?: string;
    /** Ancho y alto del botón (px, rem, etc.). Ej: 192 o "12rem" */
    width?: number | string;
    height?: number | string;
    className?: string;      // clases extra para el <button>
    textClassName?: string;  // clases extra para el <span> (texto)
    disabled?: boolean;
    ariaLabel?: string;
};

export default function ButtonPrimary({
    onClick,
    label = "EMPEZAR",
    imageSrc = "/images/btn_principal.png",
    width = 192,  // 192px ~ w-48
    height = 64,  // 64px  ~ h-16
    className = "",
    textClassName = "",
    disabled = false,
    ariaLabel,
}: ButtonPrimaryProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel || label}
            className={[
                // base layout
                "relative flex items-center justify-center select-none",
                // tamaño fijo por inline style (para no depender de clases dinámicas)
                // visual
                "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                // animación “presionar”
                "transition-all duration-100 ease-out",
                "shadow-[0_8px_0_rgba(0,0,0,0.35),0_18px_28px_rgba(0,0,0,0.35)]",
                "hover:brightness-105",
                "active:translate-y-[2px] active:scale-95 active:shadow-[0_4px_0_rgba(0,0,0,0.35),0_10px_18px_rgba(0,0,0,0.35)]",
                // disabled
                "disabled:opacity-60 disabled:cursor-not-allowed",
                className,
            ].join(" ")}
            style={{ width, height }}
        >
            <img
                src={imageSrc}
                alt={label}
                className="absolute inset-0 w-full h-full object-cover rounded-[14px]"
                draggable={false}
            />
            <span className={["relative z-10", "font-azo text-stone-800 text-lg font-bold", textClassName].join(" ")}>
                {label}
            </span>
        </button>
    );
}
