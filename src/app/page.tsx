/* app/page.tsx */
"use client";
import React from "react";
import Landing from "./home/components/public/landing";
import Page from "./home/page";

type BrandKey = "juanvaldez" | "colombina" | "alpina" | "macpollo";

export default function AppRoot() {
  const [enabledCamara, setEnabledCamara] = React.useState(false);
  const [, setBrand] = React.useState<BrandKey | null>(null);

  const handleStart = (selected: BrandKey) => {
    setBrand(selected);
    setEnabledCamara(true); // activa cámara o vista principal
  };

  return (
    <div
      className={`antialiased min-h-screen relative ${
        !enabledCamara ? "overflow-hidden" : "overflow-auto"
      }`}
    >
      {!enabledCamara ? <Landing onStart={handleStart} /> : <Page />}
    </div>
  );
}
