/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import { EventProfile } from "@/app/services/eventService";

export default function EventPhotoBoothLanding({
  event,
  onStart,
}: {
  event: EventProfile;
  onStart?: () => void;
}) {
  return (
    <div
      className="relative min-h-[100svh] w-full overflow-hidden"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Background Image */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: `url('${event.bgImage || "/images/placeholder.png"}')`,
        }}
        aria-hidden
      />

      <div className="mx-auto flex min-h-[100svh] max-w-[980px] flex-col items-center">
        {/* Top Logo */}
        <div className="w-full px-5 sm:px-6 md:px-8 pt-3 sm:pt-4 md:pt-6">
          <div className="mx-auto w-full max-w-[620px] flex flex-col items-center gap-2">
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

        {/* Title */}
        <h1 className="mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-xl font-semibold text-white drop-shadow-md">
          {event.name}
        </h1>

        {/* Start Button */}
        <div className="mt-8 sm:mt-12 flex flex-col items-center gap-4">
          <button
            onClick={onStart}
            className="px-8 py-4 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-lg transition-all duration-200"
          >
            Comenzar
          </button>
        </div>

        {/* Bottom Logo */}
        <div className="mt-auto flex-shrink-0 w-full px-5 sm:px-6 md:px-8 pb-6 sm:pb-8 md:pb-10">
          <div className="mx-auto w-full max-w-[400px] flex flex-col items-center gap-2">
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
    </div>
  );
}
