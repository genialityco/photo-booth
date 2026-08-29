/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  interleaveByPrompt,
  loadScreenSaverPhotos,
  type ScreenSaverPhoto,
} from "@/app/components/common/screenSaverPhotos";

/** Columnas del tablero. Cuatro es lo que da la referencia editorial: con tres
 * las tarjetas quedan enormes y se ven pocas fotos; con cinco, cada foto es
 * demasiado chica para reconocer a nadie. */
const COLUMNS = 4;

/** Tarjetas por columna y por copia. Tienen que alcanzar para que UNA copia de
 * la columna sea más alta que la pantalla (si no, el loop deja un hueco negro
 * abajo mientras sube): con 9 y las proporciones de abajo, una copia mide unas
 * 3 veces el ancho de columna, que cubre incluso una tablet vertical.
 *
 * Es también el techo de memoria de la pantalla: son
 * `COLUMNS * CARDS_PER_COLUMN` fotos distintas decodificadas a la vez (las
 * copias reusan la misma URL, así que no pesan de nuevo). Subirlo mucho pone a
 * las tablets del booth a decodificar decenas de PNG grandes al mismo tiempo. */
const CARDS_PER_COLUMN = 9;

/** Proporciones de las tarjetas (alto/ancho), mezclando verticales,
 * horizontales y cuadradas como pide el tablero tipo Pinterest. La foto va
 * recortada (`object-cover`) dentro de la tarjeta: es la tarjeta la que tiene
 * forma variada, la foto nunca se deforma. */
const CARD_RATIOS = [1.33, 1, 0.75, 1.5, 1, 1.25, 0.8, 1.4, 1.1, 0.9];

/** Cuánto más grande que el encuadre es la cuadrícula. Sobra ancho para que el
 * giro y el desplazamiento lateral de la cámara nunca dejen ver el borde. */
const GRID_WIDTH_PCT = 128;

/** Velocidad base del desplazamiento vertical, en fracción del alto de la
 * pantalla por segundo. Lento a propósito: la gracia es que se alcance a mirar
 * cada foto mientras pasa. */
const SCROLL_PER_SEC = 0.085;

/** Multiplicador por columna: el paralaje. Diferencias chicas — con más, las
 * columnas se leen como cuatro animaciones distintas en vez de un tablero. */
const COLUMN_SPEEDS = [1, 0.86, 1.14, 0.94];

/** Fracción del turno que dura la aparición desde el centro. */
const INTRO_FRACTION = 0.16;

/** Segundos de apagado final. Los "últimos dos segundos" del guion, pero
 * recortados si el turno configurado es muy corto. */
const OUTRO_SEC = 2;

export type EditorialTexts = {
  topLeft?: string;
  topCenter?: string;
  topRight?: string;
  bottomLeft?: string;
  bottomCenter?: string;
  bottomRight?: string;
};

/** easeInOutQuad. Todo el movimiento de cámara pasa por acá: es lo que evita
 * que el zoom arranque y termine de golpe. */
function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** Campana suave centrada en `center`. Sirve para los acercamientos puntuales
 * a una foto destacada: suben y bajan solos, sin cortar el desplazamiento. */
function bell(t: number, center: number, width: number): number {
  const d = (t - center) / width;
  return Math.exp(-d * d * 4);
}

/**
 * Momentos en los que la cámara se acerca a una foto destacada. `x` empuja el
 * encuadre hacia esa zona del tablero (en % del ancho), `scale` es cuánto se
 * acerca de más sobre el zoom general.
 */
const HIGHLIGHTS = [
  { at: 0.34, width: 0.13, scale: 0.11, x: -3.5 },
  { at: 0.62, width: 0.12, scale: 0.09, x: 3 },
  { at: 0.85, width: 0.1, scale: 0.07, x: -1.5 },
];

/**
 * Pantalla "editorial" del ScreenSaver: tablero vertical tipo Pinterest con
 * las fotos del evento sobre fondo negro.
 *
 * Secuencia, en loop: la pantalla arranca casi negra y la cuadrícula aparece
 * desde el centro con un fundido suave → todo el tablero sube lentamente,
 * columna por columna a velocidades distintas (paralaje) → la cámara hace un
 * zoom progresivo con inclinación, deriva lateral y perspectiva 3D sutiles, y
 * se acerca de a ratos a alguna foto sin frenar el desplazamiento → los
 * últimos segundos bajan la luz y funden a negro. Al terminar vuelve a
 * empezar con OTRAS fotos.
 *
 * Las fotos NO se animan: quedan quietas dentro de su tarjeta. Lo único que se
 * mueve es la cuadrícula, las columnas y la cámara.
 *
 * Todo el movimiento se calcula en un rAF y se escribe directo en el `style`
 * de dos o tres nodos (no como estado de React): son ~60 escrituras por
 * segundo y un re-render de React por frame haría tironear la animación en las
 * pantallas del booth.
 */
export default function ScreenSaverEditorialGrid({
  eventId,
  promptIds,
  active = true,
  durationSec = 15,
  texts,
  cardWiden = 1,
  onPhotosChange,
}: {
  eventId: string;
  /** Prompts asignados al evento (`event.prompts`); ver `loadScreenSaverPhotos`. */
  promptIds?: string[];
  /** Falso mientras otra pantalla del screensaver está al frente: la secuencia
   * se congela y vuelve a arrancar desde el principio cuando le toca el turno,
   * en vez de aparecer empezada por la mitad. */
  active?: boolean;
  /** Duración del turno de esta pantalla (viene de
   * `screenSaverSlideDurationSec`). La coreografía se reparte adentro. */
  durationSec?: number;
  /** Textos fijos de los bordes. Los que vengan vacíos no se muestran. */
  texts?: EditorialTexts;
  /** Ensancha las tarjetas (y por lo tanto el recorte visible de cada foto):
   * la proporción alto/ancho se divide por este factor. 1 = como la referencia
   * (tablet vertical); >1 achata las tarjetas para que las fotos se lean mejor
   * en una pantalla apaisada. */
  cardWiden?: number;
  /** Mismo contrato que ScreenSaverGallery: le avisa al rotador si esta
   * pantalla tiene contenido, para no darle el turno a un tablero vacío. */
  onPhotosChange?: (count: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [pool, setPool] = useState<ScreenSaverPhoto[]>([]);
  /** Cambia en cada pasada: rebaraja las fotos y reinicia la coreografía. */
  const [runKey, setRunKey] = useState(0);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);
  const outroRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** Alto de UNA copia de cada columna, en px. El desplazamiento se hace en
   * módulo de esa medida para que el loop no tenga costura (ver `measure`). */
  const copyHeights = useRef<number[]>([]);

  // `promptIds` suele llegar como literal nuevo en cada render del padre; sin
  // esto el efecto de carga se dispararía en cada uno.
  const promptKey = (promptIds ?? []).join(",");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const photos = await loadScreenSaverPhotos(
          eventId,
          promptKey ? promptKey.split(",") : []
        );
        if (!alive) return;
        setPool(photos);
        onPhotosChange?.(photos.length);
      } catch {
        if (alive) onPhotosChange?.(0);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, promptKey]);

  /**
   * Reparto de las fotos en columnas. El tablero necesita
   * `COLUMNS * CARDS_PER_COLUMN` tarjetas (36) y casi ningún evento arranca con
   * tantas, así que el pozo se recorre en ciclo: con pocas fotos se repiten,
   * pero nunca en la misma fila ni en la misma columna, porque el reparto es
   * por vueltas y no por bloques.
   */
  const columns = useMemo(() => {
    if (pool.length === 0) return [];
    const ordered = interleaveByPrompt(pool);
    const cols: ScreenSaverPhoto[][] = Array.from({ length: COLUMNS }, () => []);
    for (let i = 0; i < COLUMNS * CARDS_PER_COLUMN; i++) {
      cols[i % COLUMNS].push(ordered[i % ordered.length]);
    }
    return cols;
    // `runKey` entra a propósito: rebaraja el tablero en cada pasada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, runKey]);

  /** Mide el alto de una copia de cada columna: `scrollHeight` trae las dos
   * copias más el espacio del medio, así que una copia (con su separación) es
   * la mitad de eso más medio espacio. Sin esta corrección el salto del loop
   * queda desfasado por medio `gap` y se ve un tirón. */
  useLayoutEffect(() => {
    const measure = () => {
      copyHeights.current = columnRefs.current.map((col) => {
        if (!col) return 0;
        const gap = parseFloat(getComputedStyle(col).rowGap || "0") || 0;
        return (col.scrollHeight + gap) / 2;
      });
    };
    measure();
    window.addEventListener("resize", measure);
    // Las imágenes llegan después del primer layout y cambian el alto: se
    // vuelve a medir cuando terminan de cargar.
    const imgs = stageRef.current?.querySelectorAll("img") ?? [];
    imgs.forEach((img) => img.addEventListener("load", measure));
    return () => {
      window.removeEventListener("resize", measure);
      imgs.forEach((img) => img.removeEventListener("load", measure));
    };
  }, [columns, runKey]);

  // Coreografía. Un solo rAF maneja scroll, cámara y fundidos, todo en función
  // del tiempo transcurrido dentro del turno.
  useEffect(() => {
    if (!active || columns.length === 0) return;

    const totalMs = Math.max(6, durationSec) * 1000;
    const outroMs = Math.min(OUTRO_SEC, Math.max(6, durationSec) * 0.18) * 1000;
    const start = performance.now();
    let frame = 0;

    const apply = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / totalMs);
      const stageH = stageRef.current?.clientHeight || 1;

      // --- Columnas: el desplazamiento de abajo hacia arriba, con paralaje.
      // Con "reducir movimiento" activo el tablero queda quieto y la pantalla
      // se resuelve solo con los fundidos.
      const travelled = reduceMotion ? 0 : (elapsed / 1000) * SCROLL_PER_SEC * stageH;
      columnRefs.current.forEach((col, i) => {
        if (!col) return;
        const copyH = copyHeights.current[i] || 0;
        const raw = travelled * (COLUMN_SPEEDS[i % COLUMN_SPEEDS.length] ?? 1);
        // Módulo del alto de una copia: al pasarse, la segunda copia ya está
        // exactamente donde estaba la primera, así que el salto no se ve.
        const offset = copyH > 0 ? raw % copyH : raw;
        col.style.transform = `translate3d(0, ${-offset}px, 0)`;
      });

      // --- Cámara: zoom progresivo + deriva lateral + inclinación + 3D.
      const e = easeInOut(t);
      let scale = 1.03 + 0.17 * e;
      let shiftX = -2 + 4 * e + 1.1 * Math.sin(t * Math.PI * 2);
      for (const h of HIGHLIGHTS) {
        const w = bell(t, h.at, h.width);
        scale += h.scale * w;
        shiftX += h.x * w;
      }
      // Inclinación entre 3° y 5°, variando de a poco para que la composición
      // no quede rígida; perspectiva y giros 3D bien sutiles.
      const rotateZ = 3.6 + 0.9 * Math.sin(t * Math.PI * 1.6);
      const rotateX = 3.4 - 2.2 * e;
      const rotateY = -2.4 + 4.6 * e;

      // --- Fundidos: entra desde el centro, sale a negro.
      const intro = Math.min(1, t / INTRO_FRACTION);
      const outro = elapsed > totalMs - outroMs ? Math.min(1, (elapsed - (totalMs - outroMs)) / outroMs) : 0;

      if (cameraRef.current) {
        cameraRef.current.style.transform = reduceMotion
          ? "none"
          : `translate3d(${shiftX}%, 0, 0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(${rotateZ}deg) scale(${scale})`;
        cameraRef.current.style.opacity = String(0.15 + 0.85 * easeInOut(intro));
        // "Reducir progresivamente la iluminación de las fotografías" antes
        // del fundido: la luz baja un poco antes de que el negro tape.
        cameraRef.current.style.filter = `brightness(${1 - 0.55 * outro})`;
      }
      if (introRef.current) introRef.current.style.opacity = String(1 - easeInOut(intro));
      if (outroRef.current) outroRef.current.style.opacity = String(easeInOut(outro));

      if (elapsed >= totalMs) {
        // Fin de la pasada: se rebaraja el pozo y arranca de nuevo con otras.
        setRunKey((k) => k + 1);
        return;
      }
      frame = requestAnimationFrame(apply);
    };

    frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
  }, [active, durationSec, columns, runKey, reduceMotion]);

  if (columns.length === 0) return null;

  // Sin textos configurados no se inventa nada: la esquina simplemente no se
  // dibuja. Un evento que no llenó estos campos ve el tablero limpio.
  const copy = cleanTexts(texts);
  const hasTop = !!(copy.topLeft || copy.topCenter || copy.topRight);
  const hasBottom = !!(copy.bottomLeft || copy.bottomCenter || copy.bottomRight);

  return (
    <div ref={stageRef} className="relative w-full h-full overflow-hidden bg-black">
      {/* Escenario 3D. La perspectiva vive acá (no en la cámara) para que los
          giros de la cámara tengan profundidad de verdad y no queden planos. */}
      <div className="absolute inset-0" style={{ perspective: "1600px" }}>
        <div
          ref={cameraRef}
          className="absolute inset-0 flex justify-center will-change-transform"
          style={{
            transformStyle: "preserve-3d",
            // Valores del primer frame: sin esto se ve un fotograma con la
            // cuadrícula ya montada antes de que el rAF tome el control.
            transform: reduceMotion ? "none" : "scale(1.03) rotate(3.6deg)",
            opacity: reduceMotion ? 1 : 0.15,
          }}
        >
          {/* La cuadrícula es más ancha que el encuadre y arranca más arriba:
              así el desplazamiento saca y mete tarjetas por los bordes sin que
              se vea nunca dónde termina el tablero. */}
          <div
            className="absolute flex items-start gap-[0.9vmin]"
            style={{ width: `${GRID_WIDTH_PCT}%`, top: "-18%" }}
          >
            {columns.map((cards, colIndex) => (
              <div
                key={`col-${colIndex}-${runKey}`}
                ref={(el) => {
                  columnRefs.current[colIndex] = el;
                }}
                className="flex-1 flex flex-col gap-[0.9vmin] will-change-transform"
              >
                {/* Dos copias de la misma columna: cuando la primera termina
                    de subir, la segunda ya ocupa su lugar exacto y el
                    desplazamiento vuelve a cero sin costura. */}
                {[...cards, ...cards].map((photo, i) => (
                  <div
                    key={`${photo.id}-${i}`}
                    className="w-full overflow-hidden rounded-[1.6vmin] bg-neutral-900"
                    /* La proporción se toma por la posición DENTRO de la copia
                       (`i % CARDS_PER_COLUMN`), no por el índice absoluto: las
                       dos copias tienen que ser idénticas tarjeta por tarjeta,
                       si no el salto del loop cae en otra altura y se ve. */
                    style={{
                      aspectRatio: `1 / ${
                        CARD_RATIOS[(colIndex * 3 + (i % CARDS_PER_COLUMN)) % CARD_RATIOS.length] /
                        (cardWiden || 1)
                      }`,
                    }}
                  >
                    <img
                      src={photo.url}
                      alt=""
                      /* `cover`: la tarjeta ya tiene una forma editorial fija,
                         la foto la llena sin deformarse. Queda QUIETA — nada
                         se anima dentro de la tarjeta. */
                      className="w-full h-full object-cover"
                      decoding="async"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Viñeta fija: cierra la composición y despega los textos del tablero. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0.72) 100%)",
        }}
        aria-hidden
      />

      {/* Textos fijos de los bordes: no se mueven con la galería. Cada esquina
          sin texto configurado no se dibuja, y la fila entera desaparece si no
          hay ninguno — el tablero queda limpio, sin franjas vacías. */}
      {(hasTop || hasBottom) && (
        <div className="absolute inset-0 pointer-events-none text-white/85 uppercase font-mono">
          {hasTop && (
            <div
              className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-[3vmin] py-[2.6vmin]"
              style={{ fontSize: "clamp(0.55rem, 1.35vmin, 1rem)", letterSpacing: "0.22em" }}
            >
              {/* Los tres tramos se mantienen aunque estén vacíos: es lo que
                  deja el texto del centro centrado cuando falta el de un
                  costado. Lo que se omite es el texto, no el espacio. */}
              <span className="flex-1 text-left">{copy.topLeft}</span>
              <span className="flex-1 text-center">{copy.topCenter}</span>
              <span className="flex-1 text-right">{copy.topRight}</span>
            </div>
          )}
          {hasBottom && (
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-[3vmin] py-[2.6vmin]"
              style={{ fontSize: "clamp(0.55rem, 1.35vmin, 1rem)", letterSpacing: "0.22em" }}
            >
              <span className="flex-1 text-left">{copy.bottomLeft}</span>
              <span className="flex-1 text-center">{copy.bottomCenter}</span>
              <span className="flex-1 text-right">{copy.bottomRight}</span>
            </div>
          )}
        </div>
      )}

      {/* Entrada: negro que se abre desde el centro. */}
      <div
        ref={introRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.9) 45%, #000 78%)",
          opacity: reduceMotion ? 0 : 1,
        }}
        aria-hidden
      />

      {/* Salida: fundido a negro de los últimos segundos (tapa también los
          textos, que se van con el resto de la escena). */}
      <div
        ref={outroRef}
        className="absolute inset-0 pointer-events-none bg-black"
        style={{ opacity: 0 }}
        aria-hidden
      />
    </div>
  );
}

/** Deja afuera los campos vacíos (el admin guarda "" cuando el operador no
 * escribe nada) para que la esquina no se dibuje. */
function cleanTexts(texts?: EditorialTexts): EditorialTexts {
  if (!texts) return {};
  const out: EditorialTexts = {};
  for (const [key, value] of Object.entries(texts)) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) out[key as keyof EditorialTexts] = trimmed;
  }
  return out;
}
