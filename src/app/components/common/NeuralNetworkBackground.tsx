"use client";

import React, { useEffect, useRef } from "react";

/**
 * Fondo "red de neuronas" (BackgroundAnimation NEURAL_NETWORK): neuronas con
 * dendritas derivando lento, sinapsis tenues entre vecinas, e impulsos
 * eléctricos que viajan por las conexiones. Cuando un impulso llega a una
 * neurona, esta se enciende y dispara a sus vecinas (cascada, con período
 * refractario para que no se sature), y la sinapsis activa "chisporrotea".
 *
 * Todo en un <canvas> 2D con un sprite de brillo pre-renderizado (sin
 * shadowBlur, que es caro en tablets) y DPR acotado a 1.5. La red se arma
 * con semilla fija según el tamaño, así no salta entre renders.
 */

export const NEURAL_NETWORK_DEFAULT_COLOR = "#5CE1FF";

type Neuron = {
  ax: number; // posición ancla
  ay: number;
  x: number;
  y: number;
  phase: number;
  ampX: number;
  ampY: number;
  speed: number;
  r: number;
  charge: number; // 0..1, brillo por disparo reciente
  lastFired: number;
  edges: number[];
  dendrites: { angle: number; len: number; bend: number }[];
};

type Synapse = {
  a: number;
  b: number;
  bend: number; // curvatura, en fracción del largo (perpendicular)
  glow: number; // 0..1
};

type Pulse = {
  edge: number;
  forward: boolean; // true = de a hacia b
  t: number;
  speed: number; // px/s
};

const MAX_PULSES = 70;
const REFRACTORY_MS = 650;
const DPR_MAX = 1.5;

/** mulberry32: PRNG con semilla. No usar el Lehmer (×16807) del resto de
 * BackgroundAnimation acá: con semillas chicas sus primeros valores salen
 * correlacionados y dejaban una columna entera de la grilla vacía. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(hex: string | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim()) || /^#?([0-9a-f]{6})$/i.exec(NEURAL_NETWORK_DEFAULT_COLOR)!;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Brillo radial: núcleo casi blanco que pasa al color y se apaga. */
function makeGlowSprite([r, g, b]: [number, number, number]): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.12, `rgba(${Math.min(255, r + 120)},${Math.min(255, g + 120)},${Math.min(255, b + 120)},0.95)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function buildNetwork(w: number, h: number) {
  const rand = seededRandom(9001);
  // Densidad según el área (tablet ~50, pantalla grande ~85).
  const count = Math.max(24, Math.min(85, Math.round((w * h) / 20000)));
  const cols = Math.max(2, Math.round(Math.sqrt((count * w) / h)));
  const rows = Math.max(2, Math.ceil(count / cols));
  // La grilla se extiende un poco fuera de pantalla para que las conexiones
  // salgan por los bordes en vez de cortarse en una "caja".
  const padX = w * 0.06;
  const padY = h * 0.06;
  const cellW = (w + padX * 2) / cols;
  const cellH = (h + padY * 2) / rows;

  const neurons: Neuron[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ax = -padX + (c + 0.15 + rand() * 0.7) * cellW;
      const ay = -padY + (r + 0.15 + rand() * 0.7) * cellH;
      const nd = 2 + Math.floor(rand() * 3);
      neurons.push({
        ax,
        ay,
        x: ax,
        y: ay,
        phase: rand() * Math.PI * 2,
        ampX: 4 + rand() * 10,
        ampY: 4 + rand() * 10,
        speed: 0.15 + rand() * 0.3,
        r: 1.6 + rand() * 1.8,
        charge: 0,
        lastFired: -Infinity,
        edges: [],
        dendrites: Array.from({ length: nd }, () => ({
          angle: rand() * Math.PI * 2,
          len: 7 + rand() * 14,
          bend: (rand() - 0.5) * 0.8,
        })),
      });
    }
  }

  // Cada neurona se conecta con sus 3 vecinas más cercanas (dentro de un
  // radio), sin duplicar pares.
  const maxDist = Math.hypot(cellW, cellH) * 1.6;
  const synapses: Synapse[] = [];
  const seen = new Set<string>();
  neurons.forEach((n, i) => {
    const near = neurons
      .map((m, j) => ({ j, d: Math.hypot(m.ax - n.ax, m.ay - n.ay) }))
      .filter((o) => o.j !== i && o.d < maxDist)
      .sort((p, q) => p.d - q.d)
      .slice(0, 3);
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const idx = synapses.length;
      synapses.push({ a: i, b: j, bend: (rand() - 0.5) * 0.35, glow: 0 });
      n.edges.push(idx);
      neurons[j].edges.push(idx);
    }
  });

  return { neurons, synapses };
}

/** Punto de control de la curva (cuadrática) de una sinapsis. */
function controlPoint(a: Neuron, b: Neuron, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Perpendicular al segmento, escalada por el largo.
  return { cx: mx - (b.y - a.y) * bend, cy: my + (b.x - a.x) * bend };
}

function bezier(p0: number, c: number, p1: number, t: number) {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

export default function NeuralNetworkBackground({
  layer,
  color,
}: {
  layer: string;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rgb = parseHex(color);
    const [cr, cg, cb] = rgb;
    const sprite = makeGlowSprite(rgb);
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const rand = Math.random;

    let w = 0;
    let h = 0;
    let neurons: Neuron[] = [];
    let synapses: Synapse[] = [];
    let pulses: Pulse[] = [];
    let raf = 0;
    let last = performance.now();
    let fireTimer = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ({ neurons, synapses } = buildNetwork(w, h));
      pulses = [];
    };

    /** Enciende la neurona y manda impulsos por sus sinapsis (menos por la
     * que llegó). Disparo espontáneo: casi todas; en cascada: algunas. */
    const fire = (idx: number, now: number, viaEdge: number | null) => {
      const n = neurons[idx];
      n.charge = 1;
      n.lastFired = now;
      const chance = viaEdge === null ? 0.85 : 0.5;
      for (const e of n.edges) {
        if (e === viaEdge || pulses.length >= MAX_PULSES) continue;
        if (rand() > chance) continue;
        const s = synapses[e];
        pulses.push({ edge: e, forward: s.a === idx, t: 0, speed: 140 + rand() * 160 });
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = now / 1000;

      // 1) Movimiento lento de las neuronas alrededor de su ancla.
      if (!reduceMotion) {
        for (const n of neurons) {
          n.x = n.ax + Math.sin(time * n.speed + n.phase) * n.ampX;
          n.y = n.ay + Math.cos(time * n.speed * 0.8 + n.phase) * n.ampY;
        }
      }

      // 2) Disparos espontáneos (más seguidos con más neuronas).
      fireTimer -= dt * 1000;
      if (fireTimer <= 0 && neurons.length) {
        fire(Math.floor(rand() * neurons.length), now, null);
        const base = Math.max(250, 30000 / neurons.length);
        fireTimer = (base * (0.6 + rand() * 0.8)) * (reduceMotion ? 3 : 1);
      }

      // 3) Impulsos avanzando; al llegar, la neurona destino dispara.
      const next: Pulse[] = [];
      for (const p of pulses) {
        const s = synapses[p.edge];
        const a = neurons[s.a];
        const b = neurons[s.b];
        const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        p.t += (p.speed * dt) / len;
        s.glow = Math.max(s.glow, 0.85);
        if (p.t >= 1) {
          const target = p.forward ? s.b : s.a;
          const tn = neurons[target];
          if (now - tn.lastFired > REFRACTORY_MS && rand() < 0.75) {
            fire(target, now, p.edge);
          } else {
            tn.charge = Math.max(tn.charge, 0.45);
          }
        } else {
          next.push(p);
        }
      }
      pulses = next;

      const nodeDecay = Math.exp(-dt * 2.8);
      const edgeDecay = Math.exp(-dt * 2.2);
      for (const n of neurons) n.charge *= nodeDecay;
      for (const s of synapses) s.glow *= edgeDecay;

      // === Dibujo ===
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";

      // Sinapsis en reposo + dendritas: un solo trazo tenue.
      ctx.beginPath();
      for (const s of synapses) {
        if (s.glow > 0.03) continue;
        const a = neurons[s.a];
        const b = neurons[s.b];
        const { cx, cy } = controlPoint(a, b, s.bend);
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
      }
      for (const n of neurons) {
        for (const d of n.dendrites) {
          const ex = n.x + Math.cos(d.angle) * d.len;
          const ey = n.y + Math.sin(d.angle) * d.len;
          const qx = n.x + Math.cos(d.angle + d.bend) * d.len * 0.6;
          const qy = n.y + Math.sin(d.angle + d.bend) * d.len * 0.6;
          ctx.moveTo(n.x, n.y);
          ctx.quadraticCurveTo(qx, qy, ex, ey);
        }
      }
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.2)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sinapsis activas: más brillantes + "chisporroteo" eléctrico.
      ctx.globalCompositeOperation = "lighter";
      for (const s of synapses) {
        if (s.glow <= 0.03) continue;
        const a = neurons[s.a];
        const b = neurons[s.b];
        const { cx, cy } = controlPoint(a, b, s.bend);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.16 + s.glow * 0.5})`;
        ctx.lineWidth = 1 + s.glow * 1.2;
        ctx.stroke();

        if (s.glow > 0.35 && !reduceMotion) {
          // Rayo: la misma curva con desvíos aleatorios en cada frame.
          const segs = 9;
          const jitter = 2.5 * s.glow;
          ctx.beginPath();
          for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const j = i === 0 || i === segs ? 0 : (rand() - 0.5) * 2 * jitter;
            const x = bezier(a.x, cx, b.x, t) + j;
            const y = bezier(a.y, cy, b.y, t) - j;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(255,255,255,${0.35 * s.glow})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // Neuronas: brillo (sprite) + núcleo.
      for (const n of neurons) {
        const size = n.r * 10 * (1 + n.charge * 1.6);
        ctx.globalAlpha = Math.min(1, 0.5 + n.charge * 0.5);
        ctx.drawImage(sprite, n.x - size / 2, n.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // Impulsos: cabeza brillante + estela.
      for (const p of pulses) {
        const s = synapses[p.edge];
        const a = neurons[s.a];
        const b = neurons[s.b];
        const { cx, cy } = controlPoint(a, b, s.bend);
        for (let k = 5; k >= 0; k--) {
          const tt = p.t - k * 0.03;
          if (tt < 0) continue;
          const t = p.forward ? tt : 1 - tt;
          const x = bezier(a.x, cx, b.x, t);
          const y = bezier(a.y, cy, b.y, t);
          const size = k === 0 ? 20 : 12 - k * 1.5;
          ctx.globalAlpha = k === 0 ? 1 : 0.55 - k * 0.09;
          ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(tick);
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color]);

  return (
    <div className={`${layer} inset-0 overflow-hidden pointer-events-none`} aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
