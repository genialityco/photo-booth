"use client";

import React, { useEffect, useImperativeHandle, useRef } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export const ROLLER_MODEL_PATH = "/models/rodillo/Paint_Roller.glb";

/** Tamaño del cursor 3D en pantalla (px). Se ancla al punto de agarre (mango
 * abajo), así que el rodillo (arriba) queda a esta distancia por encima. */
export const ROLLER_VIEW_SIZE = 390;
/** Fracción de ROLLER_VIEW_SIZE, desde arriba, donde está el centro del
 * cabezal del rodillo (la parte que "pinta"). Ajustable si no calza visualmente. */
export const ROLLER_HEAD_CENTER_Y_RATIO = 0.22;
/** Ancho del cabezal del rodillo como fracción de ROLLER_VIEW_SIZE. */
export const ROLLER_HEAD_WIDTH_RATIO = 0.5;
/** Corrimiento vertical (px) del cursor completo respecto al punto de
 * tracking de la mano — positivo = más abajo. */
export const ROLLER_OFFSET_Y = 200;
// Dirección de la cámara en 3/4 (no de frente): evita que un eje largo del
// modelo apunte directo a la cámara y se vea de canto. La distancia real se
// calcula dinámicamente una vez cargado el modelo (ver fitCameraToObject).
const CAMERA_DIRECTION = new THREE.Vector3(6, 5, 9).normalize();

// Corrección de orientación del modelo tal como viene en el .glb (en
// radianes: Math.PI = 180°, Math.PI / 2 = 90°). El modelo venía "rotado
// hacia atrás" en Y, escondiendo la punta del rodillo — subir este valor
// lo gira más hacia la cámara; bajarlo (negativo) lo gira hacia el lado
// contrario. Ajustar aquí, no en el cálculo de encuadre.
const MODEL_ROTATION_Y = Math.PI / 5; // ~36°, punto de partida: iterar a ojo
const MODEL_ROTATION_X = 0;
const MODEL_ROTATION_Z = 0;

export type RollerCursorHandle = {
  /** Mueve el modelo. Coordenadas en píxeles de pantalla (window). Orientación
   * siempre fija (rodillo arriba, mango abajo) — no rota nunca. */
  setTransform: (x: number, y: number, visible: boolean) => void;
};

const RollerCursor = React.forwardRef<RollerCursorHandle>(function RollerCursor(_props, ref) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(ROLLER_VIEW_SIZE, ROLLER_VIEW_SIZE);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    // Posición inicial provisoria; se recalcula con fitCameraToObject() una
    // vez cargado el modelo, según su tamaño real.
    camera.position.copy(CAMERA_DIRECTION).multiplyScalar(12);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(5, 6, 7);
    scene.add(dirLight);

    // Environment map: sin esto, cualquier superficie con "metalness" en el
    // material (común en texturas PBR exportadas) se ve negra, porque no
    // tiene nada que reflejar.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;

    const group = new THREE.Group();
    scene.add(group);

    new GLTFLoader().load(
      ROLLER_MODEL_PATH,
      (gltf) => {
        if (disposed) return;

        const model = gltf.scene;
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (material) material.side = THREE.DoubleSide;
          }
        });

        // Aplica la corrección de orientación ANTES de medir el modelo: así
        // el centrado/escalado/encuadre de cámara (más abajo) se calculan
        // sobre la pose final ya rotada, no sobre la original del .glb.
        model.rotation.set(MODEL_ROTATION_X, MODEL_ROTATION_Y, MODEL_ROTATION_Z);

        // Actualiza las matrices del modelo ANTES de medirlo: recién cargado,
        // Box3 puede calcular mal el tamaño si las matrices de la jerarquía
        // todavía no se propagaron (causa típica de que el modelo se vea
        // diminuto). `precise=true` mide los vértices reales en vez de la
        // esfera envolvente de cada malla (que sobreestima objetos alargados
        // como un mango largo, descuadrando el centro).
        model.updateMatrixWorld(true);

        // Centra y escala el modelo para que quepa en la vista sin importar sus unidades originales.
        const box = new THREE.Box3().setFromObject(model, true);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 6 / maxDim;
        model.scale.setScalar(scale);

        group.add(model);

        // Encuadra la cámara según el tamaño REAL ya centrado/escalado (en
        // vez de una distancia fija): un mango largo + un rodillo compacto es
        // una forma muy alargada, y una distancia fija podía dejar una punta
        // afuera del cuadro (por eso "no se veía el rodillo").
        model.updateMatrixWorld(true);
        const fitBox = new THREE.Box3().setFromObject(model, true);
        const sphere = fitBox.getBoundingSphere(new THREE.Sphere());
        const radius = sphere.radius || 3;
        const halfFovRad = (camera.fov * Math.PI) / 360;
        const fitDistance = (radius / Math.sin(halfFovRad)) * 1.35; // margen extra
        camera.position.copy(CAMERA_DIRECTION).multiplyScalar(fitDistance);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
      },
      undefined,
      (err) => console.warn("[RollerCursor] no se pudo cargar el modelo del rodillo:", err),
    );

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      renderer.dispose();
      pmremGenerator.dispose();
      envTexture.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setTransform(x, y, visible) {
        const el = wrapperRef.current;
        if (!el) return;
        el.style.opacity = visible ? "1" : "0";
        // Ancla la esquina inferior-central (el mango, agarrado por la mano)
        // en el punto de tracking + ROLLER_OFFSET_Y; el rodillo queda fijo
        // por encima. Sin rotación: la orientación siempre es la misma
        // (rodillo arriba).
        el.style.transform = `translate3d(${x}px, ${y + ROLLER_OFFSET_Y}px, 0) translate(-50%, -100%)`;
      },
    }),
    [],
  );

  // Portal a document.body: RollerRevealStep vive dentro de un motion.div
  // animado (PhotoBoothWizard aplica `transform` en las transiciones entre
  // pasos), y cualquier transform en un ancestro redefine el "containing
  // block" de los elementos `position: fixed`, rompiendo su posición real en
  // pantalla. Renderizar directo en <body> evita ese problema por completo.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={wrapperRef}
      aria-hidden
      className="fixed left-0 top-0 z-[10001] pointer-events-none opacity-0"
      style={{ willChange: "transform" }}
    >
      <div ref={mountRef} style={{ width: ROLLER_VIEW_SIZE, height: ROLLER_VIEW_SIZE }} />
    </div>,
    document.body,
  );
});

export default RollerCursor;
