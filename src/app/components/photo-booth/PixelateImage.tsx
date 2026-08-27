"use client";

import React, { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

type Block = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Posición cuando la imagen está armada (= su recorte fuente, 1:1). */
  homeX: number;
  homeY: number;
  /** Posición "en el suelo" (borde inferior) cuando está desintegrada. */
  groundX: number;
  groundY: number;
  /** Vueltas (con signo, para variar dirección) que da cada eje simulado
   * mientras el bloque está en movimiento — con `spinAmount` en 0..1, el
   * ángulo real es `spinAmount * rotationsX/Y * 2π`. En reposo (spinAmount=0)
   * siempre da ángulo 0 (de frente, sin distorsión); al llegar al suelo
   * (spinAmount=1) el coseno de esa vuelta define la inclinación final con
   * la que "aterriza". */
  rotationsX: number;
  rotationsY: number;
  /** Giro adicional en el plano (roll), mismo criterio que rotationsX/Y. */
  rollTurns: number;
  /** Escala general del bloque (paralaje: bloques "más cerca" se ven un poco más grandes). */
  depth: number;
  /** Desfase 0..1 dentro de la ventana de stagger, uno para caer y otro para
   * volver a armarse — así no todos los bloques se mueven en sincro y no
   * "caen" y "suben" en el mismo orden exacto (se ve más orgánico). */
  fallDelay: number;
  riseDelay: number;
};

/** Fracción de la duración de la fase dedicada a escalonar el arranque de
 * cada bloque; el resto es lo que tarda cada bloque individual en moverse. */
const STAGGER_SPREAD = 0.65;

function blockProgress(delayFrac: number, elapsedInPhase: number, phaseMs: number) {
  const blockDur = phaseMs * (1 - STAGGER_SPREAD);
  const blockStart = delayFrac * phaseMs * STAGGER_SPREAD;
  if (blockDur <= 0) return elapsedInPhase >= blockStart ? 1 : 0;
  return clamp01((elapsedInPhase - blockStart) / blockDur);
}

/** Número de vueltas (con signo aleatorio) en un rango — usado para los tres
 * ejes de giro simulado de cada bloque. */
const randomTurns = (min: number, max: number) => (Math.random() < 0.5 ? -1 : 1) * (min + Math.random() * (max - min));

function buildBlocks(width: number, height: number, gridCols: number): Block[] {
  const blockPx = Math.max(4, Math.round(width / Math.max(4, gridCols)));
  const cols = Math.ceil(width / blockPx);
  const rows = Math.ceil(height / blockPx);
  const blocks: Block[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = col * blockPx;
      const sy = row * blockPx;
      const sw = Math.min(blockPx, width - sx);
      const sh = Math.min(blockPx, height - sy);
      if (sw <= 0 || sh <= 0) continue;

      // Dispersión horizontal aleatoria + variación de altura en el "piso"
      // de caída, para que el montón de píxeles abajo se vea desparramado
      // en vez de una fila perfecta.
      const jitterX = (Math.random() - 0.5) * blockPx * 3;
      const groundX = Math.min(Math.max(sx + jitterX, 0), width - sw);
      const pileVariance = Math.random() * blockPx * 1.4;
      // No dejar que un bloque "suba" para llegar al piso: los de la fila
      // más baja ya casi están ahí.
      const groundY = Math.max(sy, height - sh - pileVariance);

      blocks.push({
        sx,
        sy,
        sw,
        sh,
        homeX: sx,
        homeY: sy,
        groundX,
        groundY,
        rotationsX: randomTurns(1, 3),
        rotationsY: randomTurns(1, 3),
        rollTurns: randomTurns(0.15, 0.6),
        depth: 0.85 + Math.random() * 0.3,
        fallDelay: Math.random(),
        riseDelay: Math.random(),
      });
    }
  }

  // Orden fijo por profundidad: los bloques "más cerca" (depth mayor) se
  // dibujan al final, así quedan por encima de los "más lejos" donde se
  // superponen durante el vuelo — refuerza la sensación de volumen.
  blocks.sort((a, b) => a.depth - b.depth);

  return blocks;
}

/**
 * Muestra `src` con una animación de "desintegración" con look 3D: la imagen
 * se rompe en bloques que giran en dos ejes simulados (como tarjetas
 * girando, con su "reverso" sombreado) mientras caen por gravedad hacia el
 * borde inferior, proyectando una sombra que se atenúa con la altura — y
 * luego vuelven a subir, girar y encajar en su lugar. Con `loop`, el ciclo
 * completo (arma → se mantiene nítida → se desintegra → se mantiene caída →
 * vuelve a armarse) se repite indefinidamente; sin `loop`, arma una sola vez
 * (desde el suelo) y se queda así.
 *
 * Es un canvas 2D con transformaciones (scale + rotate) simulando 3D, no un
 * contexto WebGL real — evita la complejidad de una escena 3D (Three.js, que
 * ya usa este repo en RollerRevealStep/MosaicCanvas) mientras da una lectura
 * de volumen convincente para una animación decorativa.
 *
 * Reemplaza un <img> 1:1: el canvas hereda su tamaño intrínseco de la imagen
 * fuente, así que `object-contain`/`object-cover` en `className` funcionan
 * igual que en un <img>.
 */
export default function PixelateImage({
  src,
  alt = "",
  className,
  loop = false,
  gridCols = 26,
  reassembleMs = 1000,
  holdSharpMs = 2500,
  disintegrateMs = 900,
  holdFallenMs = 400,
}: {
  src: string;
  alt?: string;
  className?: string;
  /** Repite el ciclo armar/desintegrar indefinidamente en vez de armar una sola vez. */
  loop?: boolean;
  /** Columnas de la grilla de bloques (las filas se calculan para que queden ~cuadrados). Más columnas = píxeles más chicos. */
  gridCols?: number;
  /** Duración de la animación "los píxeles suben del suelo y arman la imagen". */
  reassembleMs?: number;
  /** Tiempo que la imagen se mantiene armada y nítida entre ciclos, solo con `loop`. */
  holdSharpMs?: number;
  /** Duración de la caída "la imagen se desintegra hacia el suelo", solo con `loop`. */
  disintegrateMs?: number;
  /** Tiempo que los píxeles se quedan en el suelo antes de volver a armarse, solo con `loop`. */
  holdFallenMs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  // Carga la imagen fuente (crossOrigin: anonymous, mismo criterio que
  // composeFramedImage.ts, para no dejar el canvas "tainted" si más adelante
  // hiciera falta leer píxeles de él).
  useEffect(() => {
    let cancelled = false;
    setDims(null);
    loadedImgRef.current = null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      loadedImgRef.current = img;
      setDims({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  // Corre la animación una vez que la imagen y sus dimensiones están listas.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = loadedImgRef.current;
    if (!canvas || !img || !dims) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dims;
    // Plano de sombra: el borde inferior real de la imagen ("el suelo"),
    // fijo, sin importar la altura a la que cada bloque termine posado en el
    // montón (pileVariance en buildBlocks).
    const floorY = height;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      return;
    }

    const blocks = buildBlocks(width, height, gridCols);

    // Sin esto, el translate+scale de cada bloque cae casi siempre en
    // coordenadas fraccionarias (el centro de un bloque de ancho impar, por
    // ejemplo) y el navegador reescala con blending — se nota como una fina
    // costura oscura entre bloques adyacentes incluso con la imagen ya
    // armada. Nearest-neighbor evita ese blending (y de paso refuerza la
    // estética "de píxeles").
    ctx.imageSmoothingEnabled = false;

    // spinAmount 0 = en reposo (de frente, sin inclinación); 1 = totalmente
    // desplazado (en el suelo) — el coseno de sus vueltas propias define
    // cómo "aterriza" cada bloque, distinto para cada uno.
    const computeSpin = (spinAmount: number, b: Block) => ({
      flipX: Math.cos(spinAmount * b.rotationsX * Math.PI * 2),
      flipY: Math.cos(spinAmount * b.rotationsY * Math.PI * 2),
      roll: spinAmount * b.rollTurns * Math.PI * 2,
    });

    // Cara "de frente" a brillo normal; al girar hacia el reverso (flip < 0)
    // se oscurece, como si tuviera una cara trasera sombreada — sin esto la
    // rotación se ve plana (un rectángulo que solo se angosta).
    const brightnessFor = (flip: number) => 0.35 + 0.65 * ((flip + 1) / 2);

    const drawShadow = (cx: number, cy: number, b: Block) => {
      const normHeight = clamp01((floorY - cy) / height);
      const alpha = 0.3 * (1 - normHeight);
      if (alpha <= 0.01) return;
      const w = b.sw * 0.85 * b.depth;
      const h = Math.max(2, b.sh * 0.3);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.ellipse(cx, floorY - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawBlock = (b: Block, x: number, y: number, spinAmount: number) => {
      const { flipX, flipY, roll } = computeSpin(spinAmount, b);
      const brightness = Math.min(brightnessFor(flipX), brightnessFor(flipY));
      // La escala de profundidad (paralaje) solo debe notarse en vuelo: a
      // spinAmount=0 (bloque en reposo, armado) tiene que valer exactamente
      // 1, si no los bloques quedan un pelo más chicos/grandes que su celda
      // y se ven costuras finas entre bloques incluso con la imagen ya armada.
      const effectiveDepth = 1 + (b.depth - 1) * spinAmount;
      const cx = x + b.sw / 2;
      const cy = y + b.sh / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (Math.abs(roll) > 0.001) ctx.rotate(roll);
      ctx.scale(flipX * effectiveDepth, flipY * effectiveDepth);
      ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, -b.sw / 2, -b.sh / 2, b.sw, b.sh);
      if (brightness < 0.98) {
        ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
        ctx.fillRect(-b.sw / 2, -b.sh / 2, b.sw, b.sh);
      }
      ctx.restore();
    };

    const renderSharp = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
    };

    const renderFallen = () => {
      ctx.clearRect(0, 0, width, height);
      for (const b of blocks) drawShadow(b.groundX + b.sw / 2, b.groundY + b.sh / 2, b);
      for (const b of blocks) drawBlock(b, b.groundX, b.groundY, 1);
    };

    const renderDisintegrate = (elapsedInPhase: number) => {
      ctx.clearRect(0, 0, width, height);
      const positions = blocks.map((b) => {
        const p = easeInCubic(blockProgress(b.fallDelay, elapsedInPhase, disintegrateMs));
        return {
          b,
          p,
          x: b.homeX + (b.groundX - b.homeX) * p,
          y: b.homeY + (b.groundY - b.homeY) * p,
        };
      });
      for (const { b, x, y } of positions) drawShadow(x + b.sw / 2, y + b.sh / 2, b);
      for (const { b, x, y, p } of positions) drawBlock(b, x, y, p);
    };

    const renderReassemble = (elapsedInPhase: number) => {
      ctx.clearRect(0, 0, width, height);
      const positions = blocks.map((b) => {
        const p = easeOutCubic(blockProgress(b.riseDelay, elapsedInPhase, reassembleMs));
        return {
          b,
          p,
          x: b.groundX + (b.homeX - b.groundX) * p,
          y: b.groundY + (b.homeY - b.groundY) * p,
        };
      });
      for (const { b, x, y } of positions) drawShadow(x + b.sw / 2, y + b.sh / 2, b);
      for (const { b, x, y, p } of positions) drawBlock(b, x, y, 1 - p);
    };

    const start = performance.now();

    if (!loop) {
      // Arma una sola vez (desde el suelo) y se queda así — sin más ciclos.
      const tick = (now: number) => {
        const elapsed = now - start;
        if (elapsed >= reassembleMs) {
          renderSharp();
          rafRef.current = null;
          return;
        }
        renderReassemble(elapsed);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }

    // Modo loop: arma → se mantiene nítida → se desintegra → se mantiene
    // caída → vuelve a armarse — indefinidamente.
    const cycleMs = reassembleMs + holdSharpMs + disintegrateMs + holdFallenMs;

    const tick = (now: number) => {
      const elapsed = (now - start) % cycleMs;
      if (elapsed < reassembleMs) {
        renderReassemble(elapsed);
      } else if (elapsed < reassembleMs + holdSharpMs) {
        renderSharp();
      } else if (elapsed < reassembleMs + holdSharpMs + disintegrateMs) {
        renderDisintegrate(elapsed - reassembleMs - holdSharpMs);
      } else {
        renderFallen();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [dims, loop, gridCols, reassembleMs, holdSharpMs, disintegrateMs, holdFallenMs]);

  return (
    <canvas
      ref={canvasRef}
      width={dims?.width ?? 1}
      height={dims?.height ?? 1}
      role="img"
      aria-label={alt}
      className={className}
    />
  );
}
