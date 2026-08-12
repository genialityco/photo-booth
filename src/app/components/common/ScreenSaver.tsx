"use client";

import React, { useEffect, useState, useCallback } from "react";
import MediaTapScreen from "@/app/components/common/MediaTapScreen";

type ScreenSaverProps = {
  splashImage?: string;
  /** Video en loop; si está presente, tiene prioridad sobre splashImage. */
  videoUrl?: string;
  inactivityTimeout?: number; // en milisegundos
};

export default function ScreenSaver({
  splashImage,
  videoUrl,
  inactivityTimeout = 15000, // 15 segundos por defecto
}: ScreenSaverProps) {
  const media = videoUrl || splashImage;
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
    if (!media) return;

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
  }, [media, inactivityTimeout, isActive, handleActivity]);

  if (!media || !isActive) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black transition-transform duration-500 ease-in-out ${
        isExiting ? "translate-x-full" : "translate-x-0"
      }`}
    >
      <MediaTapScreen imageUrl={splashImage} videoUrl={videoUrl} onTap={handleActivity} />
    </div>
  );
}
