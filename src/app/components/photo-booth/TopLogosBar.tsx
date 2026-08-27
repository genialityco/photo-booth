/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import type { EventProfile } from "@/app/services/photo-booth/eventService";

/** Fila de logos superiores del evento (`logoTop`/`logoBottom`) — uno a cada
 * lado, o centrado si solo hay uno. Compartida entre EventPhotoBoothLanding
 * (pantalla de selección de filtro) y BoothMirror (pantalla de resultado en
 * la pantalla espejo), para que ambas usen exactamente el mismo layout. */
export default function TopLogosBar({
  event,
  wide = false,
  className = "",
}: {
  event: EventProfile;
  wide?: boolean;
  className?: string;
}) {
  if (!event.logoTop && !event.logoBottom) return null;

  const logoClassName = wide
    ? "h-[clamp(4.5rem,14vh,8rem)] w-[24vw] object-fill select-none"
    : "h-[clamp(3rem,11vh,6rem)] max-w-[42vw] w-auto object-contain select-none";

  return (
    <div
      className={`relative z-5 flex-shrink-0 w-full flex items-center gap-4 ${
        event.logoTop && event.logoBottom ? "justify-between" : "justify-center"
      } ${className}`}
    >
      {event.logoTop && (
        <img src={event.logoTop} alt={event.name} className={logoClassName} draggable={false} />
      )}
      {event.logoBottom && (
        <img src={event.logoBottom} alt="" className={logoClassName} draggable={false} />
      )}
    </div>
  );
}
