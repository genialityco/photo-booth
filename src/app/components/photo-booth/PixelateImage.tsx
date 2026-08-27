"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// Acento cian "HUD/holograma" — mismo criterio que el resto del wizard.
const ACCENT_COLOR = new THREE.Color(0x5eeaff);
// Mismo tono, pero con componentes >1 (HDR): así el marco queda muy por
// encima del threshold del bloom sin importar cómo se calibre, sin que una
// zona blanca de la foto en sí (que nunca pasa de 1.0) dispare bloom sin
// querer.
const FRAME_EMISSIVE_COLOR = ACCENT_COLOR.clone().multiplyScalar(2.4);

/** Perímetro de un rectángulo con esquinas redondeadas, centrado en el
 * origen — usado tanto para el marco (con un agujero, como un anillo) como
 * si hiciera falta cualquier otra forma con el mismo criterio. */
function roundedRectPath(shape: THREE.Shape | THREE.Path, w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - r);
  shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + h);
  shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
}

// Cuánto se agranda el marco emisivo respecto de la foto (proporcional a
// cada dimensión, no un valor absoluto — así no rompe el aspect ratio).
// Tiene que ser menor a FRUSTUM_MARGIN (la cámara se aleja ese tanto extra)
// para que quede aire real entre el borde del marco y el borde del canvas:
// sin ese margen extra, el sangrado del bloom se cortaría de golpe justo en
// el borde en vez de desvanecerse.
const FRAME_MARGIN = 0.09;
const FRUSTUM_MARGIN = 0.15;

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aExplode;
  attribute vec3 aColor;
  attribute float aSize;

  uniform float uBlend; // 0 = armada, 1 = explotada
  uniform float uGlow;  // 0..1, más grande/más cian mientras se mueve
  uniform float uPixelRatio;
  uniform float uBaseSize;

  varying vec3 vColor;
  varying float vGlow;

  void main() {
    vec3 pos = mix(position, aExplode, uBlend);
    vColor = aColor;
    vGlow = uGlow;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uBaseSize * aSize * uPixelRatio * (1.0 + uGlow * 0.7) / max(0.05, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vGlow;
  uniform vec3 uAccent;
  uniform float uOpacity;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    // Punto suave con un pelín de núcleo más brillante — no un cuadrado ni
    // un círculo de borde duro.
    float alpha = smoothstep(0.5, 0.05, d);
    float core = smoothstep(0.22, 0.0, d);
    vec3 tinted = mix(vColor, uAccent, vGlow * 0.4);
    vec3 finalColor = tinted + core * uAccent * vGlow * 0.5;
    gl_FragColor = vec4(finalColor, alpha * uOpacity);
  }
`;

// Ventana del crossfade partículas↔foto real, acotada a una fracción de la
// fase para que no se coma toda la animación si `reassembleMs`/
// `disintegrateMs` se configuran cortos.
const REVEAL_MS = 400;

/**
 * Muestra `src` como una nube de partículas en 3D real (WebGL vía Three.js,
 * `THREE.Points` + shader propio — mismo estilo que
 * https://threejs.org/examples/webgl_points_dynamic.html, no mallas sólidas):
 * miles de puntos, cada uno con el color muestreado de su región de la foto,
 * que estallan hacia afuera —alejándose del centro en X/Y y, buena parte de
 * ellos, hacia la cámara en Z (dando la sensación de que salen de la
 * pantalla)— y vuelven a converger. Las partículas arman una versión
 * "impresionista" de la foto (un color promedio por celda, no el detalle
 * real) — por eso, apenas terminan de acomodarse, hay un crossfade rápido
 * a la foto real (una malla con la textura original) que se disuelve otra
 * vez en partículas justo antes de la siguiente explosión. El movimiento
 * (mezcla armada↔explotada) lo calcula la GPU en el vertex shader a partir
 * de un único uniform por frame, así que miles de puntos no cuestan más CPU
 * por frame que unos pocos — a diferencia de la versión con mallas, que
 * iteraba cada bloque en JS.
 *
 * Bloom real de post-procesado (`EffectComposer` + `UnrealBloomPass`, no un
 * truco de shader ni un blur de CSS): un marco emisivo con esquinas
 * redondeadas alrededor de toda la foto (reemplaza el halo que antes se
 * hacía con un `<div>` desenfocado por CSS) y las partículas más brillantes
 * de la explosión "sangran" luz de verdad hacia sus vecinos. El marco usa
 * un color con componentes >1 (HDR) para quedar siempre muy por encima del
 * threshold del bloom, así nunca dispara bloom por accidente en zonas
 * blancas de la foto en sí (que no pasan de 1.0).
 *
 * Con `loop`, el ciclo completo (arma → se mantiene nítida → se disuelve en
 * partículas quieta → explota → se mantiene dispersa → vuelve a armarse) se
 * repite indefinidamente; sin `loop`, arma una sola vez (desde la
 * explosión) y se queda así. La disolución y la explosión son pasos
 * separados a propósito (`dissolveMs` / `disintegrateMs`): si pasaran a la
 * vez, la nube de partículas nunca se alcanza a ver quieta antes de salir
 * disparada.
 *
 * Ya usa Three.js el resto del repo (RollerRevealStep, MosaicCanvas) — mismo
 * patrón: WebGLRenderer montado en un div, loop propio con
 * requestAnimationFrame, y disposal explícito de geometría/material al
 * desmontar (acá importa más que en MosaicCanvas: este componente se
 * remonta con cada foto nueva, no una sola vez por evento).
 */
export default function PixelateImage({
  src,
  alt = "",
  className,
  loop = false,
  gridCols = 26,
  reassembleMs = 1800,
  holdSharpMs = 2500,
  dissolveMs = 500,
  disintegrateMs = 2800,
  holdFallenMs = 700,
}: {
  src: string;
  alt?: string;
  className?: string;
  /** Repite el ciclo armar/explotar indefinidamente en vez de armar una sola vez. */
  loop?: boolean;
  /** Columnas de la grilla de muestreo (las filas se calculan según el aspecto de la foto). Con partículas el costo es bajo — se puede ir bastante más denso que con mallas. */
  gridCols?: number;
  /** Duración de la animación "las partículas vuelven de la explosión y arman la imagen". */
  reassembleMs?: number;
  /** Tiempo que la imagen se mantiene armada y nítida entre ciclos, solo con `loop`. */
  holdSharpMs?: number;
  /** Duración del crossfade "la foto se disuelve en la nube de partículas, todavía quieta" — un paso propio, ANTES de que arranque el movimiento de la explosión, para que se alcance a ver la nube armada antes de que salga disparada. Solo con `loop`. */
  dissolveMs?: number;
  /** Duración del movimiento de la explosión en sí (una vez que ya está disuelta en partículas), solo con `loop`. */
  disintegrateMs?: number;
  /** Tiempo que las partículas se quedan dispersas en el aire antes de volver a armarse, solo con `loop`. */
  holdFallenMs?: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let animId: number | null = null;
    let points: THREE.Points | null = null;
    let photoMesh: THREE.Mesh | null = null;
    let frameMesh: THREE.Mesh | null = null;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

    // Post-procesado: render normal + bloom real sobre lo que sea brillante
    // (el marco emisivo y los núcleos de las partículas en explosión).
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.55, 0.82);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    let worldH = 1;
    // Cuánto más grande que la foto es el frustum visible (zoom-out extra) —
    // 0 = llena el canvas exacto (como antes); con el marco emisivo hace
    // falta algo de aire alrededor de la foto para que el marco y el
    // sangrado del bloom tengan dónde dibujarse sin que el propio borde del
    // canvas los corte de golpe. Se fija cuando carga la imagen (ver
    // FRUSTUM_MARGIN más abajo); antes de eso vale 0 (sin efecto).
    let frustumMargin = 0;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      // Distancia de cámara tal que, en z=0, el frustum vertical mida
      // `worldH * (1 + frustumMargin)` — el contenedor ya viene con el
      // aspect de la foto (useFitAspectBox en ResultStep), así que con
      // frustumMargin=0 esto llena el frame exacto (equivalente a
      // object-contain); con margen, la foto queda un poco más chica
      // dentro del canvas, dejándole aire al marco.
      const vFov = (camera.fov * Math.PI) / 180;
      camera.position.z = (worldH * (1 + frustumMargin)) / 2 / Math.tan(vFov / 2);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    // Carga la imagen fuente aparte (no como THREE.Texture: acá solo hace
    // falta para muestrear colores por CPU una vez, no para texturizar una
    // malla — evita subir una textura a GPU que después no se usa).
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (disposed) return;

      const imgW = img.naturalWidth || img.width || 1;
      const imgH = img.naturalHeight || img.height || 1;
      worldH = 1;
      const worldW = worldH * (imgW / imgH);

      const cols = Math.max(8, Math.round(gridCols));
      const rows = Math.max(1, Math.ceil((worldH / worldW) * cols));

      // Downscale a `cols`x`rows` para obtener un color promedio por celda —
      // el propio navegador hace el promediado al reescalar con smoothing.
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = cols;
      sampleCanvas.height = rows;
      const sctx = sampleCanvas.getContext("2d")!;
      sctx.drawImage(img, 0, 0, cols, rows);
      const data = sctx.getImageData(0, 0, cols, rows).data;

      const count = cols * rows;
      const positions = new Float32Array(count * 3);
      const explodes = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);

      const cellW = worldW / cols;
      const cellH = worldH / rows;
      // Radio de referencia para la distancia del estallido — el mayor de
      // los dos semiejes de la foto, así la explosión siempre manda las
      // partículas bien más allá del cuadro sin importar si es vertical u
      // horizontal.
      const blastRef = Math.max(worldW, worldH);

      let i = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++, i++) {
          const px = (row * cols + col) * 4;
          colors[i * 3] = data[px] / 255;
          colors[i * 3 + 1] = data[px + 1] / 255;
          colors[i * 3 + 2] = data[px + 2] / 255;

          const homeX = -worldW / 2 + (col + 0.5) * cellW;
          const homeY = worldH / 2 - (row + 0.5) * cellH;
          positions[i * 3] = homeX;
          positions[i * 3 + 1] = homeY;
          positions[i * 3 + 2] = 0;

          // Dirección de estallido: alejándose del centro de la foto, con un
          // desvío angular aleatorio para que no sea un abanico perfecto.
          const centerDist = Math.hypot(homeX, homeY);
          const baseAngle = centerDist > 1e-4 ? Math.atan2(homeY, homeX) : Math.random() * Math.PI * 2;
          const angle = baseAngle + (Math.random() - 0.5) * 1.3;
          const blastDist = blastRef * (1.2 + Math.random() * 1.8);
          explodes[i * 3] = homeX + Math.cos(angle) * blastDist;
          explodes[i * 3 + 1] = homeY + Math.sin(angle) * blastDist;

          // Z: la mayoría sale despedida hacia la cámara (Z+), una minoría
          // se va hacia atrás para variar — y ~1 de cada 5 recibe un
          // impulso extra fuerte para que ESA partícula en particular se
          // sienta salir disparada de la pantalla hacia el espectador.
          const towardCameraKick = Math.random() < 0.2 ? 1.1 + Math.random() * 1.7 : 0;
          const explodeZBase = 0.25 + Math.random() * 0.65 + towardCameraKick;
          explodes[i * 3 + 2] = Math.random() < 0.15 ? -explodeZBase * 0.5 : explodeZBase;

          sizes[i] = 0.6 + Math.random() * 0.8;
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aExplode", new THREE.BufferAttribute(explodes, 3));
      geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uBlend: { value: 0 },
          uGlow: { value: 0 },
          uPixelRatio: { value: pixelRatio },
          uBaseSize: { value: 900 / cols },
          uAccent: { value: ACCENT_COLOR },
          uOpacity: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      points = new THREE.Points(geometry, material);
      scene.add(points);

      // Foto real (textura sin procesar, reusa el mismo <img> ya decodido —
      // no dispara una segunda descarga): oculta al arrancar, aparece con
      // el crossfade una vez que las partículas terminan de acomodarse.
      const photoTexture = new THREE.Texture(img);
      photoTexture.colorSpace = THREE.SRGBColorSpace;
      photoTexture.needsUpdate = true;
      const photoMaterial = new THREE.MeshBasicMaterial({
        map: photoTexture,
        transparent: true,
        opacity: 0,
        toneMapped: false,
      });
      photoMesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), photoMaterial);
      photoMesh.renderOrder = 1; // por encima de las partículas durante el crossfade
      scene.add(photoMesh);

      // La cámara se aleja un poco más que el marco (FRUSTUM_MARGIN >
      // FRAME_MARGIN) — así queda una franja de canvas vacío entre el borde
      // del marco y el borde real del canvas, donde el bloom puede
      // desvanecerse en vez de cortarse de golpe.
      frustumMargin = FRUSTUM_MARGIN;

      // Marco emisivo alrededor de toda la foto — reemplaza el halo que
      // antes era un <div> con `filter: blur()` por CSS. Es un anillo (forma
      // exterior con un agujero interior, mismas esquinas redondeadas) así
      // que solo el borde brilla, no toda la tarjeta. El margen es
      // proporcional a cada dimensión por separado (no un valor absoluto
      // compartido), para no deformar el aspect ratio del marco.
      const outerPadW = worldW * FRAME_MARGIN;
      const outerPadH = worldH * FRAME_MARGIN;
      const thickness = Math.min(outerPadW, outerPadH) * 1.3;
      const radius = Math.min(worldW, worldH) * 0.1;
      const frameShape = new THREE.Shape();
      roundedRectPath(frameShape, worldW + outerPadW * 2, worldH + outerPadH * 2, radius + Math.min(outerPadW, outerPadH));
      const frameHole = new THREE.Path();
      roundedRectPath(
        frameHole,
        worldW + outerPadW * 2 - thickness * 2,
        worldH + outerPadH * 2 - thickness * 2,
        Math.max(0.001, radius + Math.min(outerPadW, outerPadH) - thickness)
      );
      frameShape.holes.push(frameHole);
      const frameMaterial = new THREE.MeshBasicMaterial({
        color: FRAME_EMISSIVE_COLOR,
        transparent: true,
        opacity: 1,
        toneMapped: false,
      });
      frameMesh = new THREE.Mesh(new THREE.ShapeGeometry(frameShape), frameMaterial);
      frameMesh.position.z = -0.01; // apenas detrás del plano de la foto/partículas
      scene.add(frameMesh);

      resize();
    };
    img.src = src;

    const start = performance.now();
    const cycleMs = reassembleMs + holdSharpMs + dissolveMs + disintegrateMs + holdFallenMs;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!points) {
        composer.render();
        return;
      }

      const material = points.material as THREE.ShaderMaterial;
      const now = performance.now();

      let blend = 0;
      let glow = 0;
      // photoReveal: 0 = se ve la nube de partículas, 1 = se ve la foto real
      // (crossfade — nunca se muestran ambas a mitad de opacidad por mucho
      // tiempo, es una transición corta justo en el instante en que las
      // partículas terminan de acomodarse o están por arrancar a explotar).
      let photoReveal = 0;

      if (prefersReducedMotion) {
        blend = 0;
        glow = 0;
        photoReveal = 1;
      } else if (!loop) {
        const elapsed = now - start;
        const revealMs = Math.min(REVEAL_MS, reassembleMs * 0.4);
        const revealStart = reassembleMs - revealMs;
        if (elapsed >= reassembleMs) {
          blend = 0;
          glow = 0.03;
          photoReveal = 1;
        } else {
          blend = 1 - easeOutCubic(clamp01(elapsed / reassembleMs));
          glow = 0.6;
          photoReveal = elapsed < revealStart ? 0 : clamp01((elapsed - revealStart) / revealMs);
        }
      } else {
        const elapsed = (now - start) % cycleMs;
        const reassembleRevealMs = Math.min(REVEAL_MS, reassembleMs * 0.4);
        const reassembleRevealStart = reassembleMs - reassembleRevealMs;
        const holdSharpEnd = reassembleMs + holdSharpMs;
        const dissolveEnd = holdSharpEnd + dissolveMs;
        const explodeEnd = dissolveEnd + disintegrateMs;

        if (elapsed < reassembleMs) {
          blend = 1 - easeOutCubic(clamp01(elapsed / reassembleMs));
          glow = 0.6;
          // Las partículas llegan a destino (blend≈0) bastante antes de que
          // termine la fase entera (el easing frena de a poco) — el
          // crossfade a la foto real arranca recién sobre el final, para no
          // revelarla mientras todavía se ve movimiento.
          photoReveal = elapsed < reassembleRevealStart ? 0 : clamp01((elapsed - reassembleRevealStart) / reassembleRevealMs);
        } else if (elapsed < holdSharpEnd) {
          blend = 0;
          // Con la foto armada y quieta el brillo casi no debe notarse —
          // solo un resto muy tenue, para que el "premio" (la foto nítida)
          // se vea limpio.
          glow = 0.02 + 0.02 * (0.5 + 0.5 * Math.sin(now / 900));
          photoReveal = 1;
        } else if (elapsed < dissolveEnd) {
          // Paso propio: la foto se disuelve en la nube de partículas, pero
          // TODAVÍA no se mueve (blend sigue en 0) — así se alcanza a ver la
          // nube armada quieta antes de que arranque la explosión, en vez de
          // que ambas cosas pasen a la vez.
          const dt = elapsed - holdSharpEnd;
          blend = 0;
          glow = 0.5;
          photoReveal = 1 - clamp01(dt / dissolveMs);
        } else if (elapsed < explodeEnd) {
          // Ya disuelta del todo: acá arranca el movimiento de la explosión
          // en sí, con el mismo ritmo/duración que el rearmado (mismo
          // easeOutCubic, misma sensación de velocidad).
          const t = (elapsed - dissolveEnd) / disintegrateMs;
          blend = easeOutCubic(clamp01(t));
          glow = 0.6;
          photoReveal = 0;
        } else {
          blend = 1;
          glow = 0.4;
          photoReveal = 0;
        }
      }

      // Cerca de la foto armada, blending normal (colores correctos, se ve
      // como una foto); en movimiento/dispersa, blending aditivo — ahí es
      // donde se ve el "brillo de partículas" tipo la referencia.
      material.blending = blend < 0.03 ? THREE.NormalBlending : THREE.AdditiveBlending;
      material.uniforms.uBlend.value = blend;
      material.uniforms.uGlow.value = glow;
      material.uniforms.uOpacity.value = 1 - photoReveal;

      if (photoMesh) {
        (photoMesh.material as THREE.MeshBasicMaterial).opacity = photoReveal;
      }
      if (frameMesh) {
        // El marco siempre está presente (a diferencia del borde de las
        // partículas, que se apaga casi del todo en reposo) — es lo que le
        // da presencia constante a la tarjeta; se pone más intenso mientras
        // hay movimiento.
        (frameMesh.material as THREE.MeshBasicMaterial).opacity = 0.55 + glow * 0.45;
      }

      composer.render();
    };
    animId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      if (animId !== null) cancelAnimationFrame(animId);
      resizeObserver.disconnect();

      if (points) {
        points.geometry.dispose();
        (points.material as THREE.ShaderMaterial).dispose();
      }
      if (photoMesh) {
        photoMesh.geometry.dispose();
        const photoMat = photoMesh.material as THREE.MeshBasicMaterial;
        photoMat.map?.dispose();
        photoMat.dispose();
      }
      if (frameMesh) {
        frameMesh.geometry.dispose();
        (frameMesh.material as THREE.MeshBasicMaterial).dispose();
      }
      bloomPass.dispose();
      composer.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [src, loop, gridCols, reassembleMs, holdSharpMs, dissolveMs, disintegrateMs, holdFallenMs]);

  return <div ref={mountRef} role="img" aria-label={alt} className={className} />;
}
