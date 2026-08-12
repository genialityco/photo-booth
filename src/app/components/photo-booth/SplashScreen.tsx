"use client";

import React, { useRef } from "react";
import { EventProfile } from "@/app/services/photo-booth/eventService";
import { runButtonClickEffect } from "@/app/components/common/click-effects";
import MediaTapScreen from "@/app/components/common/MediaTapScreen";

export default function SplashScreen({
  event,
  onStart,
}: {
  event: EventProfile;
  onStart: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleStart = () => {
    if (containerRef.current) {
      runButtonClickEffect(event.buttonClickEffect, { target: containerRef.current });
    }
    onStart();
  };

  return (
    <div ref={containerRef} className="fixed inset-0 overflow-hidden">
      <MediaTapScreen
        imageUrl={event.splashImage || event.bgImage}
        videoUrl={event.screenSaverVideoUrl}
        onTap={handleStart}
      />
    </div>
  );
}
