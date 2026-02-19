/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState, useCallback } from "react";

type ScreenSaverProps = {
  splashImage?: string;
  inactivityTimeout?: number; // en milisegundos
};

export default function ScreenSaver({
  splashImage,
  inactivityTimeout = 15000, // 15 segundos por defecto
}: ScreenSaverProps) {
  const [isActive, setIsActive] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleActivity = useCallback(() => {
    if (isActive && !isExiting) {
      // Iniciar animación de salida
      setIsExiting(true);
      // Después de la animación, ocultar completamente
      setTimeout(() => {
        setIsActive(false);
        setIsExiting(false);
      }, 500); // Duración de la animación
    }
  }, [isActive, isExiting]);

  useEffect(() => {
    if (!splashImage) return;

    // Eventos que indican actividad del usuario
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    let timeoutId: NodeJS.Timeout;

    const handleUserActivity = () => {
      if (isActive) {
        handleActivity();
      } else {
        // Resetear el timer
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setIsActive(true);
        }, inactivityTimeout);
      }
    };

    // Agregar listeners
    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity);
    });

    // Iniciar el timer inicial
    timeoutId = setTimeout(() => {
      setIsActive(true);
    }, inactivityTimeout);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [splashImage, inactivityTimeout, isActive, handleActivity]);

  if (!splashImage || !isActive) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-pointer transition-transform duration-500 ease-in-out ${
        isExiting ? "translate-x-full" : "translate-x-0"
      }`}
      onClick={handleActivity}
    >
      <img
        src={splashImage}
        alt="Screen Saver"
        className="w-full h-full object-cover select-none"
        draggable={false}
      />
      
      {/* Indicador de "Toca para continuar" */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white text-center animate-pulse">
        <p className="text-lg sm:text-xl font-semibold drop-shadow-lg">
          Toca la pantalla para continuar
        </p>
      </div>
    </div>
  );
}
