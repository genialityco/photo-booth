"use client";

import React, { useEffect, useImperativeHandle, useRef } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export const HAND_MODEL_PATH = "/models/hand/simplehand.fbx";

/** Tamaño del cursor 3D en pantalla (px) — mismo criterio que RollerCursor:
 * la cámara siempre encuadra el modelo completo (ver fitDistance más abajo),
 * así que este valor solo determina el tamaño final en pantalla. */
export const HAND_VIEW_SIZE = 260;

// Dirección de cámara en 3/4, igual que RollerCursor — de frente la mano se
// vería plana/sin volumen.
const CAMERA_DIRECTION = new THREE.Vector3(3, 4, 9).normalize();

// Corrección de orientación del modelo tal como viene en el .fbx (radianes).
// Punto de partida: mano "de frente" hacia la cámara, dedos arriba — ajustar
// a ojo si el .fbx viene con otra pose por defecto.
const MODEL_ROTATION_X = 0;
const MODEL_ROTATION_Y = 0;
const MODEL_ROTATION_Z = 0;

export type HandCursorHandle = {
  /** Mueve el modelo. Coordenadas en píxeles de pantalla (window). */
  setTransform: (x: number, y: number, visible: boolean) => void;
};

const HandCursor3D = React.forwardRef<HandCursorHandle>(function HandCursor3D(_props, ref) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(HAND_VIEW_SIZE, HAND_VIEW_SIZE);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    camera.position.copy(CAMERA_DIRECTION).multiplyScalar(12);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(5, 6, 7);
    scene.add(dirLight);

    // Environment map: sin esto, materiales PBR con "metalness" se ven negros.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;

    const group = new THREE.Group();
    scene.add(group);

    new FBXLoader().load(
      HAND_MODEL_PATH,
      (model) => {
        if (disposed) return;

        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (material) material.side = THREE.DoubleSide;
          }
        });

        model.rotation.set(MODEL_ROTATION_X, MODEL_ROTATION_Y, MODEL_ROTATION_Z);
        model.updateMatrixWorld(true);

        // Escala el modelo para que quepa en la vista sin importar sus
        // unidades originales (FBX suele venir en cm, mucho más grande que
        // el .glb del rodillo).
        const box = new THREE.Box3().setFromObject(model, true);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 6 / maxDim;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        // Centra el modelo ya escalado en el origen de la escena.
        const scaledBox = new THREE.Box3().setFromObject(model, true);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);
        model.position.sub(center);

        group.add(model);

        // Encuadra la cámara para que quepa el modelo completo.
        model.updateMatrixWorld(true);
        const fitBox = new THREE.Box3().setFromObject(model, true);
        let maxDistFromOrigin = 0;
        for (const x of [fitBox.min.x, fitBox.max.x]) {
          for (const y of [fitBox.min.y, fitBox.max.y]) {
            for (const z of [fitBox.min.z, fitBox.max.z]) {
              maxDistFromOrigin = Math.max(maxDistFromOrigin, new THREE.Vector3(x, y, z).length());
            }
          }
        }
        const radius = maxDistFromOrigin || 3;
        const halfFovRad = (camera.fov * Math.PI) / 360;
        const fitDistance = (radius / Math.sin(halfFovRad)) * 1.35;
        camera.position.copy(CAMERA_DIRECTION).multiplyScalar(fitDistance);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
      },
      undefined,
      (err) => console.warn("[HandCursor3D] no se pudo cargar el modelo de la mano:", err),
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
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      },
    }),
    [],
  );

  // Portal a document.body — ver mismo comentario en RollerCursor: evita que
  // un transform en un ancestro (ej. el crossfade de PhotoBoothWizard) rompa
  // el posicionamiento fixed.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={wrapperRef}
      aria-hidden
      className="fixed left-0 top-0 z-[10001] pointer-events-none opacity-0"
      style={{ willChange: "transform" }}
    >
      <div ref={mountRef} style={{ width: HAND_VIEW_SIZE, height: HAND_VIEW_SIZE }} />
    </div>,
    document.body,
  );
});

export default HandCursor3D;
