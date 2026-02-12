/* app/page.tsx */
"use client";
import React from "react";
import EventsLanding from "@/app/components/photo-booth/EventsLanding";

type BrandKey = "BANDERA_COLOMBIA" | "BANDERA_MEXICO" | "BANDERA_FRANCIA";
export default function AppRoot() {
  return (
    <div className="antialiased min-h-screen relative overflow-hidden">
      <EventsLanding />
    </div>
  );
}
