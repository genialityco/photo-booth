/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

// ── Configuración ──────────────────────────────────────────────────────────────
const MESSAGE     = "NextGen Simplicity";
const FONT_FAMILY = "Arial Black";
const BG_COLOR    = 0x0a0a0a;
const EMPTY_COLOR = 0x0a0a0a;
const CELL_SIZE   = 0.4;
const CELL_GAP    = 0.03;
const FALL_FROM_Y = 12;   // distancia desde donde caen (siempre positivo)
const GRAVITY     = 18;   // magnitud de la aceleración
// "up" = caen desde abajo hacia arriba | "down" = caen desde arriba hacia abajo
const FALL_DIRECTION: "up" | "down" = "down";
const BOUNCE      = 0.35;
const FLOAT_AMP   = 0.04;
const FLOAT_SPEED = 0.8;
// ──────────────────────────────────────────────────────────────────────────────

type TaskItem = { id: string; url?: string; videoUrl?: string };
type EventOption = { id: string; name: string; slug: string };

function computeTextCells(text: string, cols: number, rows: number, cellPx: number) {
  const w = cols * cellPx, h = rows * cellPx;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  let fs = h * 0.78;
  ctx.font = `900 ${fs}px ${FONT_FAMILY}`;
  while (ctx.measureText(text).width > w * 0.94 && fs > 8) {
    fs -= 2; ctx.font = `900 ${fs}px ${FONT_FAMILY}`;
  }
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2);
  const data = ctx.getImageData(0, 0, w, h).data;
  const result: { col: number; row: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = Math.floor(c * cellPx + cellPx / 2);
      const py = Math.floor(r * cellPx + cellPx / 2);
      if (data[(py * w + px) * 4] > 128) result.push({ col: c, row: r });
    }
  return result;
}

// ── Componente Three.js ───────────────────────────────────────────────────────
function MosaicCanvas({ eventId }: { eventId: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    let W = mount.clientWidth, H = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.setClearColor(BG_COLOR);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const frustH = 10;
    const frustW = frustH * (W / H);
    const camera = new THREE.OrthographicCamera(
      -frustW / 2, frustW / 2, frustH / 2, -frustH / 2, 0.1, 100
    );
    camera.position.z = 10;

    const step = CELL_SIZE + CELL_GAP;
    const COLS = Math.floor(frustW / step);
    const ROWS = Math.floor(frustH / step);
    const textCells = computeTextCells(MESSAGE, COLS, ROWS, 32)
      .sort((a, b) =>
        FALL_DIRECTION === "up"
          ? b.row - a.row || a.col - b.col   // de abajo hacia arriba
          : a.row - b.row || a.col - b.col   // de arriba hacia abajo
      );

    const toWorld = (col: number, row: number) => ({
      x: -frustW / 2 + col * step + step / 2,
      y:  frustH / 2 - row * step - step / 2,
    });

    interface Tile {
      mesh: THREE.Mesh;
      targetX: number; targetY: number;
      velY: number; landed: boolean;
      floatOffset: number; floatOffsetX: number;
      itemId: string | null; videoEl: HTMLVideoElement | null;
    }

    const tiles: Tile[] = textCells.map(({ col, row }) => {
      const { x, y } = toWorld(col, row);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE),
        new THREE.MeshBasicMaterial({ color: EMPTY_COLOR })
      );
      mesh.position.set(x, y, 0);
      scene.add(mesh);
      return { mesh, targetX: x, targetY: y, velY: 0, landed: true,
               floatOffset: Math.random() * Math.PI * 2,
               floatOffsetX: Math.random() * Math.PI * 2,
               itemId: null, videoEl: null };
    });

    function assignMedia(tile: Tile, item: TaskItem) {
      if (tile.itemId === item.id) return;
      tile.itemId = item.id;
      if (tile.videoEl) { tile.videoEl.pause(); tile.videoEl.src = ""; tile.videoEl = null; }
      const src = item.videoUrl || item.url;
      if (!src) return;
      let texture: THREE.Texture;
      if (item.videoUrl) {
        const vid = document.createElement("video");
        vid.crossOrigin = "anonymous";
        vid.src = src; vid.loop = true; vid.muted = true;
        vid.playsInline = true; vid.autoplay = true;
        vid.play().catch(() => {});
        tile.videoEl = vid;
        texture = new THREE.VideoTexture(vid);
      } else {
        texture = new THREE.TextureLoader().load(src);
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      const mat = tile.mesh.material as THREE.MeshBasicMaterial;
      mat.map = texture; mat.color.set(0xffffff); mat.needsUpdate = true;
      // "up": sale desde abajo (targetY - FALL_FROM_Y), sube hasta targetY
      // "down": sale desde arriba (targetY + FALL_FROM_Y), baja hasta targetY
      tile.mesh.position.y = FALL_DIRECTION === "up"
        ? tile.targetY - FALL_FROM_Y
        : tile.targetY + FALL_FROM_Y;
      tile.velY = 0; tile.landed = false;
    }

    // Firestore
    const constraints: Parameters<typeof query>[1][] = [
      where("status", "==", "done"),
      orderBy("finishedAt", "asc"),
    ];
    if (eventId) constraints.push(where("eventId", "==", eventId));
    const q = query(collection(db, "imageTasks"), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const items: TaskItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.forEach((item, i) => { if (i < tiles.length) assignMedia(tiles[i], item); });
    });

    // Contador
    const countDiv = document.createElement("div");
    countDiv.style.cssText =
      "position:absolute;bottom:12px;right:16px;color:rgba(255,255,255,0.3);font:12px monospace;pointer-events:none";
    mount.appendChild(countDiv);

    // Loop
    let animId: number;
    let last = performance.now();
    function animate() {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      let landedCount = 0;
      tiles.forEach((tile) => {
        if (!tile.landed) {
          // "up": aceleración positiva (sube), "down": negativa (baja)
          tile.velY += (FALL_DIRECTION === "up" ? GRAVITY : -GRAVITY) * dt;
          tile.mesh.position.y += tile.velY * dt;
          const reachedTarget = FALL_DIRECTION === "up"
            ? tile.mesh.position.y >= tile.targetY
            : tile.mesh.position.y <= tile.targetY;
          if (reachedTarget) {
            tile.mesh.position.y = tile.targetY;
            tile.velY = -tile.velY * BOUNCE;
            if (Math.abs(tile.velY) < 0.3) { tile.velY = 0; tile.landed = true; }
          }
        } else {
          tile.mesh.position.y = tile.targetY + Math.sin(t * FLOAT_SPEED + tile.floatOffset) * FLOAT_AMP;
          tile.mesh.position.x = tile.targetX + Math.sin(t * FLOAT_SPEED * 0.7 + tile.floatOffsetX) * FLOAT_AMP * 0.5;
          if (tile.itemId) landedCount++;
        }
      });
      countDiv.textContent = `${landedCount} / ${tiles.length}`;
      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      W = mount.clientWidth; H = mount.clientHeight;
      renderer.setSize(W, H);
      const fw = frustH * (W / H);
      camera.left = -fw / 2; camera.right = fw / 2;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      unsub();
      window.removeEventListener("resize", onResize);
      tiles.forEach((t) => { t.videoEl?.pause(); });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(countDiv)) mount.removeChild(countDiv);
    };
  }, [eventId]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MosaicPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    getDocs(
      query(collection(db, "events"), where("isActive", "==", true), orderBy("createdAt", "desc"))
    ).then((snap) => {
      const list: EventOption[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setEvents(list);
    });
  }, []);

  if (!started) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6"
           style={{ background: "#0a0a0a" }}>
        <h1 className="text-white text-3xl font-bold tracking-widest">MOSAICO</h1>
        <div className="flex flex-col gap-3 w-72">
          <label className="text-white/60 text-sm">Seleccionar evento</label>
          <select
          style={{ background: "#0a0a0a" }}
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/50"
          >
            <option value="">Todos los eventos</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <button
            onClick={() => setStarted(true)}
            className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:bg-white/90 transition-colors"
          >
            Iniciar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#0a0a0a" }}>
      <MosaicCanvas key={selectedEventId} eventId={selectedEventId} />

      {/* Botón para volver al selector */}
      <button
        onClick={() => setStarted(false)}
        className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-white/10 text-white/50 text-xs hover:bg-white/20 transition-colors"
      >
        ← Cambiar evento
      </button>
    </div>
  );
}
