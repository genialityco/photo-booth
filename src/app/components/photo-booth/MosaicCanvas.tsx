/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";

// ── Configuración ──────────────────────────────────────────────────────────────
const MESSAGE     = "NextGen Simplicity";
const FONT_FAMILY = "CustomMosaicFont"; // Use a custom font name
const FONT_URL    = "/font/Neue_Haas_Unica_W1G_Light.ttf"; // Path to your font file
const BG_IMAGE    = "/images/FONDO-TEXTO-IMAGENES.png";
const BG_COLOR    = 0x0a0a0a; // Fallback
const EMPTY_COLOR = 0xcccccc;
const CELL_SIZE   = 0.1;
const CELL_GAP    = 0.01; // Reducido el espacio del margen
const FALL_FROM_Y = 12;   // distancia desde donde caen (siempre positivo)
const GRAVITY     = 18;   // magnitud de la aceleración
const FALL_DIRECTION: "up" | "down" = "down";
const BOUNCE      = 0.35;
const FLOAT_AMP   = 0.04;
const FLOAT_SPEED = 0.8;
const IMAGE_MULTIPLIER = 2; // Multiplica la cantidad de imágenes que se muestran repetidas
// ──────────────────────────────────────────────────────────────────────────────

type TaskItem = { id: string; url?: string; videoUrl?: string };

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
    let fs = lineH * 0.78;
    ctx.font = `900 ${fs}px ${FONT_FAMILY}`;
    while (ctx.measureText(line).width > w * 0.94 && fs > 6) {
      fs -= 1; ctx.font = `900 ${fs}px ${FONT_FAMILY}`;
    }
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    
    // Adjust Y position to bring lines closer together
    // Decrease spacing by calculating offset based on line index
    const totalTextHeight = lineCount * fs * 0.8; // Estimated total height
    const startY = (h - totalTextHeight) / 2 + (fs * 0.4); // Start centered vertically
    const yPos = startY + li * (fs * 0.8); // 0.8 is the line-height multiplier, adjust this to bring lines closer
    
    ctx.fillText(line, w / 2, yPos);
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

export default function MosaicCanvas({ 
  eventId, 
  isShowing = true,
  onReady
}: { 
  eventId: string,
  isShowing?: boolean,
  onReady?: () => void
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [fontLoaded, setFontLoaded] = useState(false);
  const onReadyRef = useRef(onReady);
  const isShowingRef = useRef(isShowing);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    isShowingRef.current = isShowing;
  }, [isShowing]);

  useEffect(() => {
    // Load custom font using FontFace API
    const loadFont = async () => {
      try {
        const font = new FontFace(FONT_FAMILY, `url(${FONT_URL})`);
        await font.load();
        document.fonts.add(font);
        setFontLoaded(true);
      } catch (error) {
        console.error("Error loading custom font for mosaic:", error);
        // Fallback to true so the canvas still renders even if font fails
        setFontLoaded(true);
      }
    };
    
    loadFont();
  }, []);

  useEffect(() => {
    if (!fontLoaded) return;

    const mount = mountRef.current!;
    let W = mount.clientWidth, H = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    // Remove clear color to make the canvas transparent and let the background image show through
    // renderer.setClearColor(BG_COLOR);
    mount.appendChild(renderer.domElement);

    // Apply background image to mount point
    mount.style.backgroundImage = `url(${BG_IMAGE})`;
    mount.style.backgroundSize = "cover";
    mount.style.backgroundPosition = "center";
    mount.style.backgroundColor = `#${BG_COLOR.toString(16).padStart(6, '0')}`;

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
    const CELL_PX = Math.max(16, Math.round(1200 / COLS));
    const textCells = computeTextCells(MESSAGE, COLS, ROWS, CELL_PX)
      .sort((a, b) =>
        FALL_DIRECTION === "up"
          ? b.row - a.row || a.col - b.col
          : a.row - b.row || a.col - b.col
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
      mesh.visible = false; // Oculto hasta tener la imagen cargada
      scene.add(mesh);
      return { mesh, targetX: x, targetY: y, velY: 0, landed: true,
               floatOffset: Math.random() * Math.PI * 2,
               floatOffsetX: Math.random() * Math.PI * 2,
               itemId: null, videoEl: null };
    });

    const textureCache = new Map<string, { tex: THREE.Texture, vid?: HTMLVideoElement }>();

    function loadTexture(src: string, isVideo: boolean): Promise<{ tex: THREE.Texture, vid?: HTMLVideoElement } | null> {
      return new Promise((resolve) => {
        if (textureCache.has(src)) {
          resolve(textureCache.get(src)!);
          return;
        }

        if (isVideo) {
          const vid = document.createElement("video");
          vid.crossOrigin = "anonymous";
          vid.src = src; vid.loop = true; vid.muted = true;
          vid.playsInline = true; vid.autoplay = true;
          vid.onloadeddata = () => {
            const tex = new THREE.VideoTexture(vid);
            tex.colorSpace = THREE.SRGBColorSpace;
            const data = { tex, vid };
            textureCache.set(src, data);
            resolve(data);
          };
          vid.onerror = () => resolve(null);
          vid.play().catch(() => {});
        } else {
          new THREE.TextureLoader().load(src, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const data = { tex };
            textureCache.set(src, data);
            resolve(data);
          }, undefined, () => resolve(null));
        }
      });
    }

    function assignMedia(tile: Tile, item: TaskItem, textureData: { tex: THREE.Texture, vid?: HTMLVideoElement } | null) {
      if (tile.itemId === item.id) return;
      tile.itemId = item.id;
      // Note: we don't pause shared videos here to avoid stopping for all tiles
      tile.videoEl = null; 
      
      if (!textureData) return;
      
      tile.videoEl = textureData.vid || null;

      const mat = tile.mesh.material as THREE.MeshBasicMaterial;
      mat.map = textureData.tex; 
      mat.color.set(0xffffff); 
      mat.needsUpdate = true;
      tile.mesh.visible = true; // Mostrar la pieza

      tile.mesh.position.y = FALL_DIRECTION === "up"
        ? tile.targetY - FALL_FROM_Y
        : tile.targetY + FALL_FROM_Y;
      tile.velY = 0; tile.landed = false;
    }

    const constraints: Parameters<typeof query>[1][] = [
      where("status", "==", "done"),
      orderBy("finishedAt", "asc"),
    ];
    if (eventId) constraints.push(where("eventId", "==", eventId));
    const q = query(collection(db, "imageTasks"), ...constraints);
    
    const unsub = onSnapshot(q, async (snap) => {
      const items: TaskItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      
      // Primero cargamos todas las texturas de los items que acaban de llegar
      const uniqueItems = Array.from(new Map(items.map(i => [(i.videoUrl || i.url), i])).values());
      await Promise.all(uniqueItems.map(i => {
        const src = i.videoUrl || i.url;
        if (!src) return Promise.resolve(null);
        return loadTexture(src, !!i.videoUrl);
      }));

      // Multiplicar las imágenes
      const multipliedItems: TaskItem[] = [];
      if (items.length > 0) {
        for (let m = 0; m < IMAGE_MULTIPLIER; m++) {
          items.forEach(item => {
            // Usamos un id modificado para las copias para que React/Three.js
            // piensen que son items diferentes si es necesario en assignMedia
            multipliedItems.push({
              ...item,
              id: m === 0 ? item.id : `${item.id}-copy-${m}`
            });
          });
        }
      }

      multipliedItems.forEach((item, i) => { 
        if (i < tiles.length) {
          const src = item.videoUrl || item.url;
          const texData = src ? textureCache.get(src) : null;
          assignMedia(tiles[i], item, texData || null);
        }
      });
      
      if (onReadyRef.current) {
        onReadyRef.current();
      }
    });

    const countDiv = document.createElement("div");
    countDiv.style.cssText =
      "position:absolute;bottom:12px;right:16px;color:rgba(255,255,255,0.3);font:12px monospace;pointer-events:none";
    mount.appendChild(countDiv);

    let animId: number;
    let last = performance.now();
    function animate() {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      
      if (!isShowingRef.current) {
        // Render current state (which is hidden anyways, or tiles haven't started dropping)
        renderer.render(scene, camera);
        return;
      }
      
      const t = now / 1000;
      let landedCount = 0;
      tiles.forEach((tile) => {
        if (!tile.landed) {
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
  }, [eventId, fontLoaded]);

  if (!fontLoaded) {
    return <div className="absolute inset-0 flex items-center justify-center bg-black text-white/50 text-sm">Cargando fuente...</div>;
  }

  return <div ref={mountRef} className="absolute inset-0" />;
}
