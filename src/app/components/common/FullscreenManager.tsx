"use client";

import { useEffect } from "react";

/**
 * Complemento del PWA: cuando la app NO se abrió como app instalada (pestaña
 * normal de Chrome, o durante el montaje del evento), la lleva a pantalla
 * completa apenas se puede.
 *
 * `document.documentElement.requestFullscreen()` NO se puede llamar al cargar:
 * todos los navegadores exigen un gesto del usuario. Así que:
 *
 *  1. Intento optimista al montar (por si heredó activación de la navegación;
 *     si falla, se ignora).
 *  2. Listener de un solo uso para el PRIMER gesto (tap / tecla): ese toque
 *     entra a fullscreen. En el kiosco el asistente toca la pantalla de
 *     inmediato, así que se ve full desde el primer toque.
 *  3. Si sale de fullscreen (Esc / gesto del SO), se rearma para que el
 *     siguiente toque lo restaure.
 *
 * Instalada desde "Agregar a pantalla de inicio" (manifest `display:
 * "fullscreen"`) ya arranca full sin ningún toque y este componente es
 * inofensivo (detecta que ya está en fullscreen y no hace nada).
 *
 * iOS Safari no expone `Element.requestFullscreen` (solo `<video>`): ahí es
 * un no-op — usar la PWA instalada.
 */
export default function FullscreenManager() {
  useEffect(() => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
    };

    const request =
      el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!request) return; // sin Fullscreen API (iOS Safari): no-op

    const isFullscreen = () =>
      Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);

    let armed = false;

    const goFullscreen = () => {
      if (isFullscreen()) return;
      try {
        const p = request({ navigationUI: "hide" } as FullscreenOptions);
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {
            /* gesto insuficiente / bloqueado: se reintenta al próximo */
          });
        }
      } catch {
        /* idem */
      }
    };

    const onGesture = () => goFullscreen();

    const opts = { capture: true } as EventListenerOptions;
    const arm = () => {
      if (armed) return;
      armed = true;
      window.addEventListener("pointerdown", onGesture, { once: true, capture: true });
      window.addEventListener("keydown", onGesture, { once: true, capture: true });
      window.addEventListener("touchend", onGesture, { once: true, capture: true });
    };
    const disarm = () => {
      armed = false;
      window.removeEventListener("pointerdown", onGesture, opts);
      window.removeEventListener("keydown", onGesture, opts);
      window.removeEventListener("touchend", onGesture, opts);
    };

    const onFullscreenChange = () => {
      if (isFullscreen()) disarm();
      else arm();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    goFullscreen();
    if (!isFullscreen()) arm();

    return () => {
      disarm();
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  return null;
}
