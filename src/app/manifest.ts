import type { MetadataRoute } from "next";

// Next.js App Router sirve esto en `/manifest.webmanifest` y agrega solo el
// `<link rel="manifest">` al <head>. Es lo que hace que, instalada desde
// "Agregar a pantalla de inicio" en Android, la app arranque en pantalla
// completa REAL (sin barra de URL ni barra de estado ni barra de gestos) sin
// depender de ningún toque — a diferencia de `requestFullscreen`, que exige
// gesto del usuario.
//
// `display: "fullscreen"` aplica a todo el origen (booth, display, mosaic,
// admin). Por eso NO se fija `orientation` acá: la tablet del booth es
// vertical pero `display/[slug]` corre en TV horizontal.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Magic Camera",
    short_name: "Magic Camera",
    description: "Cabina de fotos con IA para eventos",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    // Orden de preferencia si el navegador no soporta "fullscreen".
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    background_color: "#0b0c10",
    theme_color: "#0b0c10",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
