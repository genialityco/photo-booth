/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import {
  TOP_BAR_LOGO_HEIGHT,
  TOP_BAR_LOGO_MAX_WIDTH,
  scaledLogoStyle,
  scaledWideLogoStyle,
} from "@/app/components/photo-booth/logoBarSizing";

/** Fila de logos superiores del evento (`logoTop`/`logoBottom`) — uno a cada
 * lado, o centrado si solo hay uno. Compartida entre EventPhotoBoothLanding
 * (pantalla de selección de filtro) y BoothMirror (pantalla de resultado en
 * la pantalla espejo), para que ambas usen exactamente el mismo layout.
 *
 * El tamaño sale de `logoTopScalePct`/`logoBottomScalePct` del evento (igual
 * que el header/footer del wizard y la pantalla de carga): antes eran clases
 * fijas, así que el valor elegido en el admin no se veía acá. */
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
    ? "object-fill select-none"
    : "h-auto w-auto object-contain select-none";

  const styleFor = (scalePct?: number) =>
    wide
      ? scaledWideLogoStyle({ scalePct })
      : scaledLogoStyle({
          baseHeight: TOP_BAR_LOGO_HEIGHT,
          baseMaxWidth: TOP_BAR_LOGO_MAX_WIDTH,
          scalePct,
          viewportMaxWidth: "46vw",
        });

  return (
    <div
      className={`relative z-5 flex-shrink-0 w-full flex items-center gap-4 ${
        event.logoTop && event.logoBottom ? "justify-between" : "justify-center"
      } ${className}`}
    >
      {event.logoTop && (
        <img
          src={event.logoTop}
          alt={event.name}
          className={logoClassName}
          style={styleFor(event.logoTopScalePct)}
          draggable={false}
        />
      )}
      {event.logoBottom && (
        <img
          src={event.logoBottom}
          alt=""
          className={logoClassName}
          style={styleFor(event.logoBottomScalePct)}
          draggable={false}
        />
      )}
    </div>
  );
}
