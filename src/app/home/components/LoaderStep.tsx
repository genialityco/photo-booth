"use client";

import React, { useMemo } from "react";

/**
 * Loader "química" mejorado: cristalería con reflejos, líquidos con menisco,
 * burbujas aleatorias y animaciones de flotación suaves.
 * Ocupa el viewport con un fondo oscuro y gradiente para mayor profundidad.
 */
export default function LoaderStep() {
  const formulas = [
    { formula: "H₂O + NaCl → ?", top: "10%", left: "10%", duration: "15s" },
    { formula: "C₆H₁₂O₆", top: "20%", right: "15%", duration: "18s" },
    { formula: "CH₃–CH₂–OH", bottom: "15%", left: "12%", duration: "20s" },
    {
      formula: <>Au + HNO₃ + 3HCl</>,
      bottom: "25%",
      right: "10%",
      duration: "16s",
    },
    { formula: "2H₂ + O₂ ⇌ 2H₂O", top: "50%", left: "45%", duration: "22s" },
  ];

  return (
    <div className="h-[100svh] w-[100vw] flex items-center justify-center relative overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black">
      {/* Fórmulas flotantes con animación mejorada */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        {formulas.map((item, i) => (
          <div
            key={i}
            className="absolute text-white/80 font-mono text-lg"
            style={{
              top: item.top,
              left: item.left,
              right: item.right,
              bottom: item.bottom,
              animation: `float ${item.duration} ease-in-out infinite`,
              animationDelay: `${i * 2}s`,
            }}
          >
            {item.formula}
          </div>
        ))}
      </div>

      {/* Cristalería con líquidos y burbujas */}
      <div className="flex items-end gap-12 z-10 animate-pulseWobble">
        <Beaker />
        <Erlenmeyer />
        <TestTube />
      </div>

      {/* Texto "Preparando formula" */}
      <div className="absolute bottom-20 z-20 text-white/90 text-2xl font-semibold animate-fadePulse">
        Preparando fórmula...
      </div>

      {/* Keyframes para las animaciones */}
      <style jsx global>{`
        @keyframes rise {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0.8;
          }
          70% {
            opacity: 0.7;
          }
          100% {
            transform: translateY(-150px) scale(1);
            opacity: 0;
          }
        }
        @keyframes wobble {
          0%,
          100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(5px);
          }
        }
        @keyframes float {
          0% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(3deg);
          }
          100% {
            transform: translateY(0px) rotate(0deg);
          }
        }
        @keyframes liquidPulse {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(2px);
          }
        }
        @keyframes pulseWobble {
          0%,
          100% {
            transform: scale(1) rotate(0deg);
          }
          50% {
            transform: scale(1.01) rotate(-1deg);
          }
        }
        @keyframes fadePulse {
          0%,
          100% {
            opacity: 0.8;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// --- Componentes de Cristalería ---

function Beaker() {
  return (
    <div className="relative w-28 h-32">
      {/* Sombra base */}
      <div className="absolute bottom-[-4px] left-0 right-0 mx-auto h-2 w-[95%] bg-black/20 rounded-[50%] blur-md" />

      {/* Vaso de precipitados */}
      <div className="w-full h-full border-2 border-white/60 rounded-b-xl rounded-t-md relative">
        {/* Reflejo de luz */}
        <div className="absolute top-4 left-2 w-2 h-2/3 bg-white/20 rounded-full blur-sm" />
        {/* Borde superior */}
        <div className="absolute -top-1 left-[-2px] right-[-2px] h-3 border-2 border-white/60 rounded-t-md" />

        <Liquid fillPercentage={60} color="bg-cyan-400/80" />
      </div>
    </div>
  );
}

function Erlenmeyer() {
  return (
    <div className="relative w-32 h-40">
      {/* Sombra base */}
      <div className="absolute bottom-[-2px] left-0 right-0 mx-auto h-2 w-[95%] bg-black/20 rounded-[50%] blur-md" />

      {/* Matraz Erlenmeyer */}
      <div
        className="w-full h-full border-2 border-white/60 relative"
        style={{ clipPath: "polygon(30% 0, 70% 0, 100% 100%, 0% 100%)" }}
      >
        {/* Borde superior */}
        <div className="absolute top-[-4px] left-[calc(30%-2px)] right-[calc(30%-2px)] h-4 border-2 border-white/60 rounded-t-sm" />
        {/* Reflejo de luz */}
        <div className="absolute top-6 left-[78%] w-2 h-2/3 bg-white/20 rounded-full blur-sm -rotate-12" />

        {/* Contenedor del líquido con el mismo clipPath */}
        <div
          className="absolute inset-0"
          style={{ clipPath: "polygon(30% 0, 70% 0, 100% 100%, 0% 100%)" }}
        >
          <Liquid fillPercentage={45} color="bg-emerald-500/80" />
        </div>
      </div>
    </div>
  );
}

function TestTube() {
  return (
    <div className="relative w-12 h-36">
      {/* Sombra base */}
      <div className="absolute bottom-[-4px] left-0 right-0 mx-auto h-2 w-[95%] bg-black/20 rounded-[50%] blur-md" />

      {/* Tubo de ensayo */}
      <div className="w-full h-full border-2 border-white/60 rounded-b-full relative">
        {/* Reflejo de luz */}
        <div className="absolute top-4 right-1.5 w-1.5 h-3/4 bg-white/20 rounded-full blur-[2px]" />
        {/* Borde superior */}
        <div className="absolute -top-1 left-[-2px] right-[-2px] h-3 border-2 border-white/60 rounded-full" />

        <Liquid fillPercentage={75} color="bg-purple-500/80" />
      </div>
    </div>
  );
}

// --- Componentes de Efectos ---

type LiquidProps = {
  fillPercentage: number;
  color: string;
};

function Liquid({ fillPercentage, color }: LiquidProps) {
  const bubbleCount = 15;
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 ${color} overflow-hidden animate-liquidPulse`}
      style={{ height: `${fillPercentage}%` }}
    >
      {/* Menisco (superficie curvada) */}
      <div className="absolute -top-1.5 left-0 right-0 h-3 bg-gradient-to-b from-white/20 to-transparent rounded-[50%]" />
      <div
        className={`absolute -top-1 left-0 right-0 h-2 ${color.replace(
          "/80",
          ""
        )} rounded-[50%]`}
      />

      {/* Generador de burbujas */}
      {[...Array(bubbleCount)].map((_, i) => (
        <Bubble key={i} />
      ))}
    </div>
  );
}

function Bubble() {
  // useMemo para que los valores aleatorios no cambien en cada render
  const styles = useMemo(() => {
    const size = Math.random() * 8 + 4; // tamaño entre 4px y 12px
    return {
      width: `${size}px`,
      height: `${size}px`,
      left: `${Math.random() * 90}%`,
      animationDuration: `${Math.random() * 3 + 2}s, ${
        Math.random() * 2 + 1
      }s`, // Duraciones aleatorias para rise y wobble
      animationDelay: `${Math.random() * 3}s`,
    };
  }, []);

  return (
    <span
      className="absolute bottom-0 rounded-full bg-white/70"
      style={{
        ...styles,
        animationName: "rise, wobble",
        animationTimingFunction: "ease-in, ease-in-out",
        animationIterationCount: "infinite",
      }}
    />
  );
}