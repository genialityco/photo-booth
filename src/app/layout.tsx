// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FullscreenManager from "./components/common/FullscreenManager";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Magic Camera",
  description: "Cabina de fotos con IA para eventos",
  applicationName: "Magic Camera",
  // `manifest.ts` ya inyecta el <link rel="manifest">; esto solo agrega los
  // íconos e info de "web app" para iOS/Android al instalar.
  appleWebApp: {
    capable: true,
    title: "Magic Camera",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c10",
  // Kiosco: ocupa detrás de los notches y evita el zoom por pellizco / doble
  // tap que sacaría de lugar el layout de la cabina.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-dvh overflow-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-dvh overflow-hidden`}
      >
        {/* ✅ bloquea scroll global */}
        {/* Fondo opcional
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/frame.jpg')" }}
        />
        */}
        <FullscreenManager />
        <div className="h-dvh w-full flex items-center justify-center p-0 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
