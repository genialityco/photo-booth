"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function LoaderStep() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const id = setInterval(() => setDots((p) => (p.length < 3 ? p + "." : "")), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 h-full w-full overflow-hidden text-white z-50">
      {/* Fondo */}
      <Image
        src="/images/fondoLoading.png"
        alt="fondo"
        fill
        priority
        sizes="100vw"
        className="object-cover !h-full !w-full" // fuerza cubrir todo
      />
      <div className="absolute inset-0 bg-black/40" />

      {/* Logo arriba */}
      <div className="absolute top-6 inset-x-0 flex justify-center z-20">
        <img
          src="/images/LOGOS.png"
          alt="Casa Científica"
          className="w-[280px] md:w-[360px] animate-fadeIn"
        />
      </div>

      {/* Texto centro */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
        <h1 className="text-center text-xl md:text-2xl font-semibold drop-shadow">
          Preparando fórmula química{dots}
        </h1>
      </div>

      {/* GIFs abajo */}
      <div className="absolute bottom-10 inset-x-0 flex justify-center gap-8 z-20">
        <img
          src="/images/laboratorio2.gif"
          alt="Laboratorio 2"
          className="w-[120px] md:w-[200px] rounded-xl shadow-xl animate-float"
        />
        <img
          src="/images/laboratorio3.gif"
          alt="Laboratorio 3"
          className="w-[200px] md:w-[240px] rounded-xl shadow-xl animate-float [animation-delay:200ms]"
        />
      </div>

      {/* PNG esquinas con animación extra */}
      <img
        src="/images/estructura_quimica.png"
        alt="estructura química"
        className="absolute top-6 left-6 w-[90px] md:w-[120px] opacity-90 drop-shadow-[0_0_12px_rgba(56,189,248,0.8)] animate-glowSway animate-spin-slow"
        style={{animationDuration: '6s'}}
      />
      <img
        src="/images/estructura_quimica.png"
        alt="estructura química"
        className="absolute top-6 right-6 w-[90px] md:w-[120px] opacity-90 drop-shadow-[0_0_12px_rgba(56,189,248,0.8)] animate-glowSway animate-spin-slow [animation-delay:400ms]"
        style={{animationDuration: '6s', animationDirection: 'reverse'}}
      />
    </div>
  );
}
