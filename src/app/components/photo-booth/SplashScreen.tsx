/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useRef } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import { runButtonClickEffect } from "@/app/components/common/click-effects";

export default function SplashScreen({
  event,
  onStart,
}: {
  event: EventProfile;
  onStart: () => void;
}) {
  const startButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleStart = () => {
    if (startButtonRef.current) {
      runButtonClickEffect(event.buttonClickEffect, { target: startButtonRef.current });
    }
    onStart();
  };

  return (
    <div
      className="relative min-h-[100svh] w-full overflow-hidden flex flex-col items-center justify-between"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Background Image */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: `url('${event.splashImage || event.bgImage || "/images/placeholder.png"}')`,
        }}
        aria-hidden
      />

      {/* Top Logo */}
      <div
        className="relative z-5 flex-shrink-0 flex justify-center items-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 sm:pb-3 md:pb-4"
      >
        <div className="w-[70vw] max-w-[380px]">
          {event.logoTop && (
            <img
              src={event.logoTop}
              alt={event.name}
              className="w-full select-none"
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* Start Button */}
      <div className="flex-1 mb-10 flex items-center justify-center px-4">
        <button
          ref={startButtonRef}
          onClick={handleStart}
          className="px-12 py-4 text-white font-semibold rounded-lg transition-all duration-200 text-base sm:text-lg active:scale-95 cursor-pointer"
          style={
            event.buttonImage
              ? {
                  backgroundImage: `url('${event.buttonImage}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {
                  backgroundColor: "rgba(255, 255, 255, 0.3)",
                }
          }
        >
          {event.buttonImage ? (
            <span className="block drop-shadow-lg font-bold">Comenzar</span>
          ) : (
            "Comenzar"
          )}
        </button>
      </div>

      {/* Bottom Logo */}
      <div className="mt-auto flex-shrink-0 w-full pb-6 sm:pb-8 md:pb-10">
        <div className="mx-auto w-full max-w-[550px] flex flex-col items-center gap-2">
          {event.logoBottom && (
            <img
              src={event.logoBottom}
              alt="Logo Inferior"
              className="w-full select-none"
              draggable={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
