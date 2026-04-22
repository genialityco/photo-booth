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
const EMPTY_COLOR = 0x0a0a1f;
const CELL_SIZE   = 0.3;
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

  const words = text.trim().split(/\s+/);
  const lines = words.length > 1
    ? [words.slice(0, Math.ceil(words.length / 2)).join(" "),
       words.slice(Math.ceil(words.length / 2)).join(" ")]
    : [text];

  const lineCount = lines.length;
  const lineH = h / lineCount;

  lines.forEach((line, li) => {
    // Ajustar tamaño de fuente para que cada línea ocupe ~90% del ancho
    let fs = lineH * 0.78;
    ctx.font = `900 ${fs}px ${FONT_FAMILY}`;
    while (ctx.measureText(line).width > w * 0.94 && fs > 6) {
      fs -= 1; ctx.font = `900 ${fs}px ${FONT_FAMILY}`;
    }
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(line, w / 2, lineH * li + lineH / 2);
  });

  const data = ctx.getImageData(0, 0, w, h).data;
  const result: { col: number; row: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = Math.floor(c * cellPx + cellPx / 2);
      const py = Math.floor(r * cellPx + cellPx / 2);
      if (data[(py * w + px) * 4] > 80) result.push({ col: c, row: r });
    }
  return result;
}

// ── Componente Three.js ───────────────────────────────────────────────────────
function MosaicCanvas({ eventId, animationType = "fall" }: { eventId: string, animationType?: "fall" | "scale-up" }) {
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
    // Mayor resolución del canvas offscreen = mejor detección de bordes
    const CELL_PX = Math.max(16, Math.round(1200 / COLS));
    const textCells = computeTextCells(MESSAGE, COLS, ROWS, CELL_PX)
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
      velY: number; velZ: number; landed: boolean;
      floatOffset: number; floatOffsetX: number;
      itemId: string | null; videoEl: HTMLVideoElement | null;
      scaleDelay?: number; scaleTimer?: number;
    }

    const tiles: Tile[] = textCells.map(({ col, row }) => {
      const { x, y } = toWorld(col, row);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE),
        new THREE.MeshBasicMaterial({ color: EMPTY_COLOR })
      );
      mesh.position.set(x, y, 0);
      scene.add(mesh);
      return { mesh, targetX: x, targetY: y, velY: 0, velZ: 0, landed: true,
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
      
      if (animationType === "fall") {
        tile.mesh.position.y = FALL_DIRECTION === "up"
          ? tile.targetY - FALL_FROM_Y
          : tile.targetY + FALL_FROM_Y;
        tile.mesh.position.z = 0;
        tile.mesh.scale.set(1, 1, 1);
        tile.velY = 0;
      } else if (animationType === "scale-up") {
        tile.mesh.position.y = tile.targetY;
        tile.mesh.position.z = -50; 
        tile.mesh.scale.set(0.01, 0.01, 0.01);
        tile.velZ = 0;
        tile.scaleDelay = Math.random() * 2;
        tile.scaleTimer = 0;
      }

      tile.landed = false;
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
          if (animationType === "fall") {
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
          } else if (animationType === "scale-up") {
            tile.scaleTimer = (tile.scaleTimer || 0) + dt;
            if (tile.scaleTimer > (tile.scaleDelay || 0)) {
              // Ease towards z = 0 and scale = 1
              tile.mesh.position.z += (0 - tile.mesh.position.z) * dt * 5;
              const targetScale = 1;
              tile.mesh.scale.x += (targetScale - tile.mesh.scale.x) * dt * 5;
              tile.mesh.scale.y += (targetScale - tile.mesh.scale.y) * dt * 5;
              tile.mesh.scale.z += (targetScale - tile.mesh.scale.z) * dt * 5;

              if (Math.abs(tile.mesh.position.z) < 0.1 && Math.abs(tile.mesh.scale.x - 1) < 0.01) {
                tile.mesh.position.z = 0;
                tile.mesh.scale.set(1, 1, 1);
                tile.landed = true;
              }
            }
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
  }, [eventId, animationType]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MosaicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = React.use(params);
  const [eventId, setEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) { setEventId(""); setLoading(false); return; }
    getDocs(
      query(collection(db, "events"), where("slug", "==", slug), where("isActive", "==", true))
    ).then((snap) => {
      setEventId(snap.empty ? "" : snap.docs[0].id);
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <span className="text-white/40 text-sm">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#0a0a0a" }}>
      <MosaicCanvas key={eventId ?? ""} eventId={eventId ?? ""} animationType="fall" />
    </div>
  );
}
