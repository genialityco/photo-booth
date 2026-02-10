/* eslint-disable @next/next/no-img-element */
/* app/components/Landing.tsx */
"use client";

import React, { useEffect, useState } from "react";
import { getStyleProfileById, type StyleProfile } from "@/app/services/styleService";
import { getPhotoBoothPromptById, getActivePhotoBoothPrompts, type PhotoBoothPrompt } from "@/app/services/brandService";

type BrandItem = {
  [x: string]: string | undefined; id: string; name: string; image: string; aria?: string, brand: string , brandName: string 
};

export default function Landing({ onStart, styleId }: { onStart?: (brand: string) => void; styleId?: string }) {
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [landingStyle, setLandingStyle] = useState<StyleProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // prefer explicit prop, otherwise read query param
        const params = new URLSearchParams(window.location.search);
        const queryStyleId = params.get("styleId");
        const effectiveStyleId = styleId || queryStyleId || null;
        console.log("Effective style ID:", effectiveStyleId);
        let style: StyleProfile | null = null;
        if (effectiveStyleId) {
          style = await getStyleProfileById(effectiveStyleId);
        }

        // Persist landing style to sessionStorage so other components can reuse it
        try {
          if (style) {
            setLandingStyle(style);
            sessionStorage.setItem("photoBoothStyle", JSON.stringify(style));
            console.log("[Landing] saved style to sessionStorage:", style.id || "(no-id)");
          }
        } catch (e) {
          console.warn("[Landing] could not save style to sessionStorage", e);
        }

        if (!style) {
          // fallback: pick first style available
          const styles = await (await import("@/app/services/styleService")).getStyleProfiles();
          style = styles && styles.length ? styles[0] : null;
        }

        if (style && style.brands && Array.isArray(style.brands) && style.brands.length) {
          const loaded: BrandItem[] = [];
          for (const bid of style.brands) {
            const b = await getPhotoBoothPromptById(bid);
            if (b) {
              const name = b.brandName || b.brand || b.id;
              const image = b.imageUrl || b.logoPath || "";
              loaded.push({ id: b.id, name, image, aria: name, brand: b.brand || b.brandName || b.id, brandName: b.brandName || b.brand || b.id });
            }
          }
          setBrands(loaded);
        } else {
          // fallback: use active brands
          const res = await getActivePhotoBoothPrompts(10);
          const loaded = res.data.map(b => ({
            id: b.id,
            name: b.brandName || b.brand || b.id,
            image: b.imageUrl || b.logoPath || "",
            aria: b.brandName || b.brand,
            brand: b.brand || b.brandName || b.id,
            brandName: b.brandName || b.brand || b.id
          }));
          setBrands(loaded);
        }
      } catch (err) {
        console.error("Error loading brands for landing:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleStart = (brandId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("brand", brandId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
    if (onStart) onStart(brandId);
  };

  if (loading) {
    return <div className="p-6 text-center text-white">Cargando marcas...</div>;
  }
  const useFlexCenter = brands.length > 0 && brands.length <= 3;

  return (
    <div className="relative min-h-[100svh] w-full overflow-hidden" style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `url('${landingStyle?.bgLanding || "/Lenovo/app-avatars-01.png"}')` }}
        aria-hidden
      />

      <div className="mx-auto flex min-h-[100svh] max-w-[980px] flex-col items-center">
        <div className="w-full px-5 sm:px-6 md:px-8 pt-3 sm:pt-4 md:pt-6">
          <div className="mx-auto w-full max-w-[620px] flex flex-col items-center gap-2">
            <img
              src={landingStyle?.logoLandingTop || "genilaty_smart_led_logo.png"}
              alt="GEN.IALITY LOGO"
              className="w-full select-none"
              draggable={false}
            />
          </div>
        </div>

        <h1 className="mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-xl font-semibold text-white drop-shadow-md">Selecciona tu evolución...</h1>

        <div className="mt-5 sm:mt-7 w-full px-5 sm:px-6 md:px-8">
          {useFlexCenter ? (
            <div className="flex items-center justify-center flex-wrap gap-6 py-8">
              {brands.map((b) => (
                <article key={b.id} role="button" tabIndex={0} aria-label={b.aria} title={b.name} onClick={() => handleStart(b.brand)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleStart(b.brand); }} className="group cursor-pointer select-none rounded-xl sm:rounded-2xl backdrop-blur shadow-md sm:shadow-xl ring-1 ring-black/5 transition-transform duration-150 hover:scale-[1.015] active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 bg-white/5 max-w-[360px] w-[min(80vw,320px)]">
                  <div className="flex flex-col items-center justify-center overflow-hidden p-2">
                    <div className="w-full max-w-[320px]">
                      <div className="relative w-full aspect-[4/3] md:aspect-square">
                        <img src={b.image || "/images/placeholder.png"} alt={b.aria || b.name} className="bg-white absolute inset-0 w-full h-full object-contain" draggable={false} style={{ borderRadius: "30px" }} />
                      </div>
                    </div>
                    <div className="px-4 py-2 text-center font-semibold text-white drop-shadow text-sm sm:text-base">{b.brandName || b.brand}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-4 md:gap-5 grid-cols-2 md:grid-cols-3 justify-items-center">
              {brands.map((b) => (
                <article key={b.id} role="button" tabIndex={0} aria-label={b.aria} title={b.name} onClick={() => handleStart(b.brand)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleStart(b.brand); }} className="group cursor-pointer select-none rounded-xl sm:rounded-2xl backdrop-blur shadow-md sm:shadow-xl ring-1 ring-black/5 transition-transform duration-150 hover:scale-[1.015] active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 bg-white/5 max-w-[320px] w-full">
                  <div className="flex flex-col items-center justify-center overflow-hidden">
                    <div className="w-full max-w-[280px]">
                      <div className="relative w-full aspect-[4/3] md:aspect-square">
                        <img src={b.image || "/images/placeholder.png"} alt={b.aria || b.name} className="bg-white absolute inset-0 w-full h-full object-contain" draggable={false} style={{ borderRadius: "30px" }} />
                      </div>
                    </div>
                    <div className="px-4 py-2 text-center font-semibold text-white drop-shadow text-sm sm:text-base">{b.name}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto w-full px-5 sm:pb-4 md:pb-6 pb-3 sm:px-6 md:px-8">
          <img
            src={landingStyle?.logoLandingBottom || "genilaty_smart_led_logo.png"}
            alt="Logos Footer"
            className="mx-auto w-full max-w-[980px] select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
