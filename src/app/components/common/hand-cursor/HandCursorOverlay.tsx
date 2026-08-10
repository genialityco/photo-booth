"use client";

import React, { useEffect, useRef } from "react";
import { acquireHandTracking, subscribeHandFrame } from "./handTrackingStore";

const CLICK_COOLDOWN_MS = 500;
const CLICKABLE_SELECTOR =
  'button, a, [role="button"], input[type="checkbox"], input[type="radio"], [data-hand-clickable]';

export default function HandCursorOverlay({ enabled }: { enabled: boolean }) {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const highlightedRef = useRef<HTMLElement | null>(null);
  const wasPinchingRef = useRef(false);
  const lastClickAtRef = useRef(0);

  // Reserva el tracking compartido (arranca la cámara/landmarker si nadie
  // más los está usando, ej. RevealStep).
  useEffect(() => {
    if (!enabled) return;
    return acquireHandTracking();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const setHighlighted = (el: HTMLElement | null) => {
      if (el === highlightedRef.current) return;
      highlightedRef.current?.classList.remove("hand-cursor-hover");
      el?.classList.add("hand-cursor-hover");
      highlightedRef.current = el;
    };

    const unsubscribe = subscribeHandFrame((frame) => {
      const cursor = cursorRef.current;
      if (!cursor) return;

      if (!frame.visible) {
        cursor.style.opacity = "0";
        setHighlighted(null);
        wasPinchingRef.current = false;
        return;
      }

      cursor.style.opacity = "1";
      cursor.style.transform = `translate3d(${frame.screenX}px, ${frame.screenY}px, 0) translate(-50%, -50%) scale(${
        frame.pinching ? 0.75 : 1
      })`;
      cursor.classList.toggle("hand-cursor--pinching", frame.pinching);

      const hovered = document.elementFromPoint(frame.screenX, frame.screenY) as HTMLElement | null;
      const clickable = hovered?.closest<HTMLElement>(CLICKABLE_SELECTOR) ?? null;
      setHighlighted(clickable);

      if (frame.pinching && !wasPinchingRef.current && clickable) {
        const now = performance.now();
        if (now - lastClickAtRef.current > CLICK_COOLDOWN_MS) {
          lastClickAtRef.current = now;
          clickable.click();
        }
      }
      wasPinchingRef.current = frame.pinching;
    });

    return () => {
      unsubscribe();
      highlightedRef.current?.classList.remove("hand-cursor-hover");
      highlightedRef.current = null;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={cursorRef}
      aria-hidden
      className="fixed left-0 top-0 z-[10000] pointer-events-none opacity-0"
      style={{ willChange: "transform" }}
    >
      <div className="hand-cursor-dot w-10 h-10 rounded-full border-2 border-white bg-white/30 shadow-lg backdrop-blur-sm transition-[background-color,border-color] duration-150" />
    </div>
  );
}
