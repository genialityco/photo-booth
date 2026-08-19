"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  acquireRollerDetection,
  getRollerDetectionStream,
  subscribeRollerFrame,
  subscribeRollerDetectionStatus,
} from "@/app/components/photo-booth/reveal/rollerDetectionStore";
import { FADE_OUT_MS, type Point, useRevealVeil } from "@/app/components/photo-booth/reveal/useRevealVeil";
import RollerCursor, {
  ROLLER_HEAD_WIDTH_RATIO,
  ROLLER_VIEW_SIZE,
  type RollerCursorHandle,
} from "@/app/components/photo-booth/reveal/RollerCursor";
import { getAspectClassName, getRevealBoxWidthCss, type PhotoAspectRatio } from "@/app/components/photo-booth/photoAspectRatio";

// Franja horizontal que deja el cabezal del rodillo al pasar (el rodillo
// tiene orientación fija, así que la franja también es siempre horizontal).
// Constantes portadas 1:1 de la app de referencia
// (C:\Users\sagp7\Documents\trainrodillo\webapp_demo.html), salvo
// MIN_STROKE_LENGTH que se reescala porque allá el canvas es 500 y acá
// CANVAS_SIZE=1024 (90/500 ≈ misma proporción).
const ROLLER_STROKE_THICKNESS_RATIO = 0.28; // relativo al largo del trazo (0.35 * 0.8: campo pintado en Y reducido 20%)
// Ancho de lo que pinta el rodillo (el "largo" de la franja horizontal),
// reducido a la mitad respecto al ancho real detectado / del cursor 3D.
const STROKE_LENGTH_SCALE = 0.5;
// Largo mínimo de trazo (unidades de canvas) para detecciones muy
// pequeñas/lejanas, para que la franja no quede imperceptible. También
// escalado, para no anular la reducción de arriba con este piso.
const MIN_STROKE_LENGTH = 184 * STROKE_LENGTH_SCALE;
// La inferencia ONNX corre mucho más lento que la pantalla (WASM de un solo
// hilo: ~1 detección/seg), así que mover el cursor solo cuando llega un
// frame nuevo se ve "a tirones". En cambio se guarda la última posición
// detectada como objetivo y se interpola hacia ella en cada
// requestAnimationFrame (60fps) — el cursor y el trazo quedan suaves aunque
// la detección en sí sea lenta. Fracción recorrida hacia el objetivo por
// frame (más alto = alcanza el objetivo más rápido pero más "tirones").
const EASE_FACTOR = 0.45;
// Distancia mínima (unidades de canvas) para pintar un nuevo trazo mientras
// se converge hacia el objetivo — evita re-pintar cientos de veces por
// segundo sobre el mismo punto.
const MIN_PAINT_MOVE = 0.6;
// === Seguimiento ("coasting") cuando se pierde la detección real ===
// Si el modelo deja de detectar el rodillo (se tapó, salió de cuadro, bajó
// la confianza), en vez de congelar el cursor y hacerlo desaparecer de
// golpe, se lo sigue moviendo "solo" usando la última velocidad conocida
// (con caída exponencial, para que frene en vez de "volar" para siempre).
// Eso evita el corte brusco y mejora la sensación de continuidad al pintar.
const COAST_DURATION_MS = 900; // cuánto tiempo sigue moviéndose solo antes de recién ahí desaparecer
const VELOCITY_SMOOTHING = 0.3; // 0-1, peso de la velocidad instantánea nueva sobre el promedio (EMA)
const VELOCITY_DECAY_PER_SEC = 0.15; // fracción de velocidad que queda después de 1s "volando solo"

type DetectionTarget = { x: number; y: number; widthPx: number };

function stampRollerAt(ctx: CanvasRenderingContext2D, center: Point, length: number, thickness: number) {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.beginPath();
  const roundRect = (ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void })
    .roundRect;
  if (typeof roundRect === "function") {
    roundRect.call(ctx, -length / 2, -thickness / 2, length, thickness, thickness / 2);
  } else {
    ctx.rect(-length / 2, -thickness / 2, length, thickness);
  }
  ctx.fill();
  ctx.restore();
}

export default function RollerRevealStep({
  aiUrl,
  videoUrl,
  frameSrc = null,
  enableFrame = true,
  revealColorHint = null,
  veilMode = "SOLID",
  paintTimeSeconds,
  aspectRatio,
  onRevealed,
}: {
  aiUrl: string;
  videoUrl?: string;
  frameSrc?: string | null;
  enableFrame?: boolean;
  revealColorHint?: string | null;
  /** "SOLID" (default): velo de color plano, revela la foto de un tirón.
   * "GRAYSCALE_PHOTO": la foto arranca en blanco y negro y el rodillo va
   * pintando el color encima. */
  veilMode?: "SOLID" | "GRAYSCALE_PHOTO";
  /** Tiempo máximo (segundos) para pintar/revelar antes de avanzar solo. Sin definir = default de useRevealVeil (28s). */
  paintTimeSeconds?: number;
  /** Relación de aspecto de la foto. "SQUARE" (default) = comportamiento original. */
  aspectRatio?: PhotoAspectRatio;
  onRevealed: () => void;
}) {
  const {
    photoCanvasRef,
    veilCanvasRef,
    revealing,
    prefersReducedMotion,
    completeReveal,
    eraseWithPath,
    canvasWidth,
    canvasHeight,
  } = useRevealVeil({
    aiUrl,
    videoUrl,
    frameSrc,
    enableFrame,
    revealColorHint,
    veilMode,
    aspectRatio,
    onRevealed,
    ...(paintTimeSeconds !== undefined ? { safetyTimeoutMs: paintTimeSeconds * 1000 } : {}),
  });

  const selfViewRef = useRef<HTMLVideoElement | null>(null);
  const rollerCursorRef = useRef<RollerCursorHandle | null>(null);
  const lastPaintPointRef = useRef<Point | null>(null); // coordenadas locales del canvas
  const lastPointerPointRef = useRef<Point | null>(null);
  const pointerActiveRef = useRef(false);
  // Última detección real (objetivo) y posición ya suavizada del cursor —
  // ver EASE_FACTOR arriba.
  const targetRef = useRef<DetectionTarget | null>(null);
  const easedPosRef = useRef<{ x: number; y: number } | null>(null);
  // Estado del "seguimiento" cuando se pierde la detección — ver COAST_DURATION_MS arriba.
  const velocityRef = useRef({ vx: 0, vy: 0 }); // px de pantalla por ms, ya suavizada (EMA)
  const lastTickPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTickTimeRef = useRef<number | null>(null);
  const lastWidthPxRef = useRef(0); // último ancho real detectado, se reutiliza mientras "vuela solo"
  const coastStartedAtRef = useRef<number | null>(null);

  const [rollerDetectionReady, setRollerDetectionReady] = useState(false);
  const [rollerDetectionError, setRollerDetectionError] = useState(false);

  const SIZE_IMG = getRevealBoxWidthCss(aspectRatio);

  const eraseRollerStroke = React.useCallback(
    (from: Point | null, to: Point, length: number, thickness: number) => {
      eraseWithPath((ctx) => {
        if (!from) {
          stampRollerAt(ctx, to, length, thickness);
          return;
        }
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.floor(dist / (thickness * 0.5)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          stampRollerAt(ctx, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, length, thickness);
        }
      });
    },
    [eraseWithPath],
  );

  // === Reserva la detección de rodillo real compartida (misma cámara si ya
  // está corriendo; si no, arranca una sola para esta pantalla). Este efecto
  // ya no depende de mediapipe/gestos de mano, así que no necesita el
  // interruptor handRevealEnabled: corre siempre que se usa este efecto. ===
  useEffect(() => {
    return acquireRollerDetection();
  }, []);

  // === Estado de la detección compartida: listo/error, y conecta el
  // self-view a la MISMA MediaStream (sin pedir una segunda cámara) ===
  useEffect(() => {
    const unsubscribe = subscribeRollerDetectionStatus((status) => {
      if (status === "ready") {
        setRollerDetectionReady(true);
        setRollerDetectionError(false);
        const stream = getRollerDetectionStream();
        if (stream && selfViewRef.current) {
          selfViewRef.current.srcObject = stream;
          selfViewRef.current.play().catch(() => {});
        }
      } else if (status === "error") {
        setRollerDetectionError(true);
      }
    });
    return unsubscribe;
  }, []);

  // === Frames de la detección compartida: solo actualizan el OBJETIVO (la
  // posición real detectada). El movimiento visible del cursor y el pintado
  // los maneja el loop de abajo, a 60fps. ===
  useEffect(() => {
    if (!rollerDetectionReady) return;

    const unsubscribe = subscribeRollerFrame((frame) => {
      targetRef.current = frame.visible ? { x: frame.screenX, y: frame.screenY, widthPx: frame.widthPx } : null;
    });

    return unsubscribe;
  }, [rollerDetectionReady]);

  // === Loop a 60fps: interpola el cursor hacia el último objetivo detectado
  // (la inferencia ONNX es mucho más lenta que la pantalla) y pinta con esa
  // posición ya suavizada, para que el movimiento se vea fluido en vez de a
  // tirones. ===
  useEffect(() => {
    if (!rollerDetectionReady) return;

    let rafId: number;
    const tick = () => {
      const now = performance.now();
      const target = targetRef.current;
      const veil = veilCanvasRef.current;
      let pos: { x: number; y: number } | null = null;

      if (target) {
        // Detección real: interpola hacia el objetivo (igual que antes) y
        // además estima la velocidad actual del movimiento (EMA), para
        // poder "seguir" con esa inercia si la detección se corta.
        if (!easedPosRef.current) {
          easedPosRef.current = { x: target.x, y: target.y };
        } else {
          easedPosRef.current.x += (target.x - easedPosRef.current.x) * EASE_FACTOR;
          easedPosRef.current.y += (target.y - easedPosRef.current.y) * EASE_FACTOR;
        }
        pos = easedPosRef.current;
        lastWidthPxRef.current = target.widthPx;

        if (lastTickTimeRef.current !== null && lastTickPosRef.current) {
          const dt = now - lastTickTimeRef.current;
          if (dt > 0) {
            const instVx = (pos.x - lastTickPosRef.current.x) / dt;
            const instVy = (pos.y - lastTickPosRef.current.y) / dt;
            velocityRef.current.vx += (instVx - velocityRef.current.vx) * VELOCITY_SMOOTHING;
            velocityRef.current.vy += (instVy - velocityRef.current.vy) * VELOCITY_SMOOTHING;
          }
        }
        lastTickPosRef.current = { x: pos.x, y: pos.y };
        lastTickTimeRef.current = now;
        coastStartedAtRef.current = null;
      } else if (easedPosRef.current) {
        // Detección perdida: sigue moviéndose solo con la última velocidad
        // conocida, decayendo con el tiempo, en vez de congelarse o
        // desaparecer de golpe.
        if (coastStartedAtRef.current === null) coastStartedAtRef.current = now;
        const coastingFor = now - coastStartedAtRef.current;

        if (coastingFor <= COAST_DURATION_MS) {
          const dt = lastTickTimeRef.current !== null ? now - lastTickTimeRef.current : 16;
          const decay = Math.pow(VELOCITY_DECAY_PER_SEC, dt / 1000);
          velocityRef.current.vx *= decay;
          velocityRef.current.vy *= decay;
          easedPosRef.current.x += velocityRef.current.vx * dt;
          easedPosRef.current.y += velocityRef.current.vy * dt;
          // No lo dejamos "volar" fuera de la ventana.
          easedPosRef.current.x = Math.min(window.innerWidth, Math.max(0, easedPosRef.current.x));
          easedPosRef.current.y = Math.min(window.innerHeight, Math.max(0, easedPosRef.current.y));
          lastTickTimeRef.current = now;
          pos = easedPosRef.current;
        } else {
          // Se acabó el tiempo de seguimiento: recién ahí desaparece.
          easedPosRef.current = null;
          lastPaintPointRef.current = null;
          lastTickPosRef.current = null;
          lastTickTimeRef.current = null;
          velocityRef.current = { vx: 0, vy: 0 };
          coastStartedAtRef.current = null;
        }
      }

      if (!pos) {
        lastPaintPointRef.current = null;
        rollerCursorRef.current?.setTransform(0, 0, false);
        rafId = requestAnimationFrame(tick);
        return;
      }

      rollerCursorRef.current?.setTransform(pos.x, pos.y, true);

      const rect = veil?.getBoundingClientRect();
      // Igual que la app de referencia: si el centro (ya suavizado/seguido)
      // del rodillo cae FUERA del cuadro de la foto, no se pinta y se corta
      // el trazo (no unir el próximo punto con este) — evita un manchón al
      // volver a entrar desde afuera.
      if (!rect || rect.width === 0 || rect.height === 0 || pos.x < rect.left || pos.x > rect.right || pos.y < rect.top || pos.y > rect.bottom) {
        lastPaintPointRef.current = null;
      } else {
        const point = {
          x: ((pos.x - rect.left) / rect.width) * canvasWidth,
          y: ((pos.y - rect.top) / rect.height) * canvasHeight,
        };

        const last = lastPaintPointRef.current;
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= MIN_PAINT_MOVE) {
          // Ancho real detectado del rodillo (el último conocido, mientras
          // "vuela solo") -> convertido a unidades del canvas, con un piso
          // mínimo para detecciones lejanas/chicas.
          const canvasUnitsPerPx = canvasWidth / rect.width;
          const length = Math.max(MIN_STROKE_LENGTH, lastWidthPxRef.current * canvasUnitsPerPx * STROKE_LENGTH_SCALE);
          const thickness = length * ROLLER_STROKE_THICKNESS_RATIO;

          eraseRollerStroke(last, point, length, thickness);
          lastPaintPointRef.current = point;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [rollerDetectionReady, eraseRollerStroke, veilCanvasRef, canvasWidth, canvasHeight]);

  // === Fallback táctil: tocar/arrastrar sobre el velo también pinta con el rodillo ===
  const pointToCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return { x: nx * canvasWidth, y: ny * canvasHeight };
  };

  const touchStrokeSize = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasUnitsPerPx = canvasWidth / rect.width;
    const length = ROLLER_VIEW_SIZE * ROLLER_HEAD_WIDTH_RATIO * canvasUnitsPerPx * STROKE_LENGTH_SCALE;
    return { length, thickness: length * ROLLER_STROKE_THICKNESS_RATIO };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerActiveRef.current = true;
    const p = pointToCanvas(e);
    const { length, thickness } = touchStrokeSize(e);
    eraseRollerStroke(null, p, length, thickness);
    lastPointerPointRef.current = p;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerActiveRef.current) return;
    const p = pointToCanvas(e);
    const { length, thickness } = touchStrokeSize(e);
    eraseRollerStroke(lastPointerPointRef.current, p, length, thickness);
    lastPointerPointRef.current = p;
  };

  const handlePointerUp = () => {
    pointerActiveRef.current = false;
    lastPointerPointRef.current = null;
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center px-3 sm:px-4 overflow-hidden">
      <div className="absolute top-[5%] z-20 bg-black/40 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-lg shadow-black/20 animate-fadeIn">
        <p
          className="text-center text-white font-semibold drop-shadow-sm"
          style={{ fontSize: "clamp(0.95rem, 2.6vmin, 1.25rem)" }}
          role="status"
          aria-live="polite"
        >
          {rollerDetectionError
            ? "Toca y desliza la pantalla para pintar con el rodillo"
            : veilMode === "GRAYSCALE_PHOTO"
              ? "Pasa el rodillo sobre la foto para pintarla de color"
              : "Pasa el rodillo sobre la foto para descubrirla"}
        </p>
      </div>

      {/* Marco/mat + sombra en capas, igual que la foto en PreviewStep — le da
          profundidad en vez de quedar pegada al fondo. */}
      <div
        className={`relative p-1.5 sm:p-2 bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/25 ${getAspectClassName(aspectRatio)} rounded-2xl shadow-[0_8px_10px_-6px_rgba(0,0,0,0.4),0_25px_45px_-12px_rgba(0,0,0,0.55)]`}
        style={{ width: SIZE_IMG, maxWidth: SIZE_IMG }}
      >
        <div className="relative w-full h-full overflow-hidden rounded-xl bg-black/5">
          <canvas
            ref={photoCanvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="absolute inset-0 w-full h-full object-contain"
          />
          <canvas
            ref={veilCanvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="absolute inset-0 w-full h-full object-contain touch-none select-none cursor-pointer"
            style={{
              opacity: revealing ? 0 : 1,
              transition: prefersReducedMotion ? "none" : `opacity ${FADE_OUT_MS}ms ease-out`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      </div>

      {/* Self-view: misma cámara de la detección compartida, solo para ubicar el rodillo */}
      {!rollerDetectionError && (
        <div className="absolute bottom-5 right-5 z-20 w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-white/60 shadow-xl">
          <video
            ref={selfViewRef}
            muted
            playsInline
            autoPlay
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      )}

      {!rollerDetectionError && <RollerCursor ref={rollerCursorRef} />}

      <button
        type="button"
        onClick={completeReveal}
        className="absolute bottom-5 left-5 z-20 bg-black/35 hover:bg-black/50 active:scale-95 backdrop-blur-sm transition-all rounded-full px-4 py-2 text-white/90 hover:text-white font-semibold shadow-lg shadow-black/20"
        style={{ fontSize: "clamp(0.8rem, 2vmin, 0.95rem)" }}
      >
        Saltar
      </button>
    </div>
  );
}
