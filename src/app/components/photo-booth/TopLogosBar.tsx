/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import type { EventProfile } from "@/app/services/photo-booth/eventService";
import {
  TOP_BAR_LOGO_HEIGHT,
  bottomLogoScalePct,
  TOP_BAR_LOGO_MAX_WIDTH,
  CORNER_PAD_BOTTOM,
  cornerBottomLogoStyle,
  cornerLogoLayout,
  cornerTopLogoStyle,
  scaledLogoStyle,
  scaledWideLogoStyle,
} from "@/app/components/photo-booth/logoBarSizing";

function topBarLogoStyle(wide: boolean, scalePct?: number) {
  return wide
    ? scaledWideLogoStyle({ scalePct })
    : scaledLogoStyle({
        baseHeight: TOP_BAR_LOGO_HEIGHT,
        baseMaxWidth: TOP_BAR_LOGO_MAX_WIDTH,
        scalePct,
        viewportMaxWidth: "46vw",
      });
}

function topBarLogoClassName(wide: boolean) {
  return wide ? "object-fill select-none" : "h-auto w-auto object-contain select-none";
}

/** Fila de logos superiores del evento (`logoTop`/`logoBottom`) — uno a cada
 * lado, o centrado si solo hay uno. Compartida entre EventPhotoBoothLanding
 * (pantalla de selección de filtro) y BoothMirror (pantalla de resultado en
 * la pantalla espejo), para que ambas usen exactamente el mismo layout.
 *
 * Con `logoTopLeft` cargado (layout de esquinas, ver `cornerLogoLayout`) la
 * fila pasa a ser `logoTopLeft` a la izquierda y `logoTop` a la derecha; el
 * `logoBottom` ya no va acá sino en `BottomLogoBar`, que cada pantalla pone
 * abajo.
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
  const corners = cornerLogoLayout(event);
  const left = corners
    ? corners.topLeft
    : event.logoTop
      ? { src: event.logoTop, scalePct: event.logoTopScalePct }
      : null;
  const right = corners
    ? corners.topRight
    : event.logoBottom
      ? { src: event.logoBottom, scalePct: bottomLogoScalePct(event.logoBottomScalePct) }
      : null;
  if (!left && !right) return null;

  return (
    <div
      className={`relative z-5 flex-shrink-0 w-full flex items-center gap-4 ${
        left && right ? "justify-between" : "justify-center"
      } ${className}`}
    >
      {left && (
        <img
          src={left.src}
          alt={event.name}
          className={topBarLogoClassName(wide)}
          style={corners && !wide ? cornerTopLogoStyle(left.scalePct) : topBarLogoStyle(wide, left.scalePct)}
          draggable={false}
        />
      )}
      {right && (
        <img
          src={right.src}
          alt=""
          className={topBarLogoClassName(wide)}
          style={corners && !wide ? cornerTopLogoStyle(right.scalePct) : topBarLogoStyle(wide, right.scalePct)}
          draggable={false}
        />
      )}
    </div>
  );
}

/** Pareja de `TopLogosBar` para el layout de esquinas: `logoBottom` centrado
 * abajo. Sin `logoTopLeft` no dibuja nada (en ese caso `logoBottom` ya está
 * arriba a la derecha, dentro de TopLogosBar). */
export function BottomLogoBar({
  event,
  wide = false,
  className = "",
}: {
  event: EventProfile;
  wide?: boolean;
  className?: string;
}) {
  const bottom = cornerLogoLayout(event)?.bottom;
  if (!bottom) return null;
  return (
    <div
      className={`relative z-5 flex-shrink-0 w-full flex items-center justify-center ${className}`}
      // Misma distancia al borde inferior que en el resto de pantallas.
      style={{ paddingBottom: CORNER_PAD_BOTTOM }}
    >
      <img
        src={bottom.src}
        alt=""
        className={topBarLogoClassName(wide)}
        style={wide ? topBarLogoStyle(wide, bottom.scalePct) : cornerBottomLogoStyle(bottom.scalePct)}
        draggable={false}
      />
    </div>
  );
}
