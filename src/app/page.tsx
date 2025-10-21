/* app/page.tsx (o el componente donde tenías el condicional) */
"use client";
import React from "react";
import Landing from "./home/components/public/landing";
// import Page from "./Page"; // asumiendo que ya existe
import Page from "./home/page"; // ajusta la ruta

type BrandKey = "juan-valdez" | "colombina" | "frisby";

export default function AppRoot() {
  const [enabledCamara, setEnabledCamara] = React.useState(false);
  const [brand, setBrand] = React.useState<BrandKey | null>(null);

  const handleStart = (selected: BrandKey) => {
    setBrand(selected);
    setEnabledCamara(true); // aquí habilitas cámara o lo que necesites
  };

  return (
    <div className="antialiased min-h-screen relative">
      {!enabledCamara ? <Landing onStart={handleStart} /> : <Page />}
    </div>
  );
}
