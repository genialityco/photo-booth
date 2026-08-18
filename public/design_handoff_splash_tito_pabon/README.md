# Handoff: Splash animado — Pinturas Tito Pabón

## Overview
Pantalla splash (arranque) para la app/experiencia "Tu rostro, tu arte" de Pinturas Tito Pabón:
el usuario se convierte en una obra de arte. La pantalla muestra la marca, el titular de campaña,
una tarjeta con la mascota, una barra de carga y un botón "Toca para comenzar".

Hay dos entregables en este bundle:
1. **Splash interactivo** — la pantalla real, con animaciones de entrada en CSS y botón clicable.
2. **Splash en versión video** — la misma composición en una línea de tiempo, para exportar MP4/GIF
   de marketing. NO es lo que se implementa en la app; es material audiovisual.

## About the Design Files
Los archivos de este bundle son **referencias de diseño hechas en HTML** — prototipos que muestran
la apariencia y el comportamiento buscados, no código de producción para copiar tal cual.
La tarea es **recrear estos diseños en el entorno existente del codebase destino**
(React Native, React, Flutter, SwiftUI, Kotlin/Compose, etc.) usando sus patrones y librerías ya
establecidos. Si aún no existe entorno, elegir el framework más apropiado para el proyecto
(para un splash móvil: React Native / Expo, Flutter o nativo) e implementar allí.

Los archivos `.dc.html` son prototipos de un entorno de diseño; su estructura interna (etiquetas
`<x-dc>`, `<helmet>`, `support.js`) es andamiaje del prototipo y **no** debe replicarse. Lo que
importa es el markup visible, los estilos inline y los `@keyframes`.

## Fidelity
**High-fidelity (hifi).** Colores, tipografías, espaciados, tiempos y easings son finales.
Recrear la UI con fidelidad de píxel usando las librerías del codebase.
Única excepción: los recortes de imagen (ver **Assets**) son provisionales y deben reemplazarse
por los originales vectoriales/PNG con transparencia.

---

## Screens / Views

### Splash — "Tu rostro, tu arte"
**Purpose:** primera pantalla al abrir la app. Presenta la marca mientras carga y ofrece
un único punto de entrada ("Toca para comenzar").

**Canvas / Layout**
- Lienzo de diseño: **440 × 760 px** (ratio ~0.579, pensado para pantalla de móvil completa).
  En la app debe ocupar el 100% del viewport/safe area; el 440×760 es la referencia de proporciones.
- Contenedor raíz: `border-radius: 34px` y `box-shadow: 0 40px 90px rgba(0,0,0,.55)` **solo en
  el prototipo** (para mostrarlo como dispositivo). En la app: sin radio ni sombra, a pantalla completa.
- Fondo: `radial-gradient(120% 90% at 50% 42%, #FFE79A 0%, #FDD962 45%, #F7C63F 100%)`.
- Columna vertical centrada, `padding: 34px 30px 30px`, `display:flex; flex-direction:column;
  align-items:center`. El bloque inferior (barra + botón) se empuja con `margin-top:auto`.
- Orden vertical: logo → titular (2 líneas) → subtítulo → tarjeta mascota → [espacio flexible] →
  barra de carga → botón.
- "ARTE" y "COLOR" son elementos **absolutos** superpuestos, no parte del flujo.

**Components**

1. **Logo de marca** (`assets/logo.png`)
   - Ancho 150 px, alto automático, centrado.
   - `filter: drop-shadow(0 6px 10px rgba(150,90,0,.28))`.
   - Fondo transparente (PNG recortado al óvalo rojo del logo).

2. **Titular** — 2 líneas, `margin-top: 26px`, `gap: 2px`, centradas.
   - Fuente: **Anton**, `font-size: 56px`, `line-height: .94`, `letter-spacing: .5px`, mayúsculas.
   - Ambas líneas con `transform: skewX(-9deg)` (falsa italic de la marca).
   - Línea 1 — texto `TU ROSTRO,` · color `#E4032E` ·
     `text-shadow: 0 3px 0 rgba(255,255,255,.55), 0 10px 22px rgba(196,0,40,.28)`.
   - Línea 2 — texto `TU ARTE` · color `#FFFFFF` ·
     `text-shadow: 0 4px 0 #d8ab2a, 0 12px 26px rgba(120,80,0,.32)`.

3. **Subtítulo** — texto `CONVIÉRTETE EN UNA OBRA DE ARTE`
   - Fuente **Barlow Condensed 800**, 25 px, `letter-spacing: .6px`, mayúsculas,
     color `#2B2118`, centrado, `margin-top: 22px`.

4. **Tarjeta de la mascota** (`assets/mascota.png`)
   - Contenedor `width: 262px`, `margin-top: 34px`, centrado.
   - Imagen a ancho completo, `border-radius: 30px`, `overflow: hidden`.
   - `box-shadow: 0 22px 44px rgba(150,95,0,.3), inset 0 0 0 1px rgba(255,255,255,.45)`.
   - Halo detrás: `inset: -14px`, `border-radius: 40px`,
     `radial-gradient(circle, rgba(255,255,255,.75), rgba(255,255,255,0) 68%)`, opacidad pulsante .35→.7.
   - Brillo (sheen) que barre la tarjeta: banda de 60% de ancho, 130% de alto,
     `linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent)`, rotada 18°.

5. **Palabras sueltas** (decorativas, absolutas, fuente **Anton** 29 px,
   `text-shadow: 0 2px 0 rgba(255,255,255,.5)`)
   - `ARTE` — color `#1FB6C4`, `rotate(-16deg)`, arriba-izquierda de la tarjeta
     (offset del prototipo: `left:-46px; top:-24px` relativo al contenedor de 262 px).
   - `COLOR` — color `#F0369A`, `rotate(-14deg)`, derecha de la tarjeta (`right:-58px; top:52px`).

6. **Barra de carga**
   - Pista: 190 × 9 px, `border-radius: 99px`, fondo `rgba(120,80,10,.18)`.
   - Relleno: `linear-gradient(90deg, #F7A600, #E4032E)`, mismo radio, animado de 4% a 100%.
   - Gota de pintura: 9 × 12 px, `border-radius: 0 0 50% 50%`, color `#E4032E`,
     colgando del extremo derecho del relleno; cae y se desvanece en bucle mientras carga.

7. **Botón "TOCA PARA COMENZAR"**
   - `padding: 16px 34px`, `border-radius: 99px`, sin borde, cursor pointer.
   - Fondo `linear-gradient(180deg, #F2143C, #C40024)`, texto `#FFFFFF`.
   - Fuente **Anton** 22 px, `letter-spacing: 1.6px`, mayúsculas.
   - Sombra (efecto 3D): `0 10px 0 #8E0019, 0 18px 30px rgba(140,0,25,.32)`.
   - **Hover:** `translateY(-2px)`; sombra `0 12px 0 #8E0019, 0 22px 34px rgba(140,0,25,.36)`.
   - **Active/press:** `translateY(6px)`; sombra `0 4px 0 #8E0019, 0 10px 18px rgba(140,0,25,.3)`.
   - Altura resultante ≈ 58 px — cumple el mínimo de 44 px de área táctil.

8. **Manchas de color de fondo** (4 círculos difuminados, `position:absolute`, animados en deriva
   lenta e infinita; `overflow:hidden` en el contenedor). Coordenadas relativas al lienzo 440×760:
   | # | pos | tamaño | gradiente radial | opacidad | blur | duración |
   |---|-----|--------|------------------|----------|------|----------|
   | 1 | top:-120 left:-130 | 290 | `#EC0C7B` → `#C2076A` | .85 | 26px | 11 s |
   | 2 | top:130 right:-120 | 250 | `#2FC3C9` → `#17A8B4` | .60 | 30px | 13 s |
   | 3 | bottom:-90 left:-110 | 280 | `#A45BD6` → `#7C3FB0` | .50 | 34px | 15 s |
   | 4 | bottom:60 right:-70 | 180 | `#2FC3C9` → `#1B9AA6` | .45 | 28px | 12 s |

   Deriva: `translate(0,0) scale(1)` → `translate(18px,-26px) scale(1.12)` → vuelta,
   `ease-in-out`, alterna signo entre manchas pares/impares.

---

## Interactions & Behavior

### Secuencia de entrada (una sola vez, al montar)
| # | Elemento | Delay | Duración | Movimiento | Easing |
|---|----------|-------|----------|-----------|--------|
| 1 | Logo | 0 s | 0.9 s | `translateY(-70px) scale(.7) rotate(-8deg)` + opacidad 0 → overshoot `translateY(6px) scale(1.04) rotate(2deg)` al 60% → reposo | `cubic-bezier(.2,1.5,.4,1)` |
| 2 | Titular línea 1 | 0.35 s | 0.7 s | `translateX(-70px) skewX(-22deg)`, opacidad 0 → `translateX(0) skewX(-9deg)` | `cubic-bezier(.2,.9,.2,1)` |
| 3 | Titular línea 2 | 0.50 s | 0.7 s | `translateX(70px) skewX(4deg)`, opacidad 0 → `translateX(0) skewX(-9deg)` | `cubic-bezier(.2,.9,.2,1)` |
| 4 | Subtítulo | 0.85 s | 0.6 s | `translateY(18px)` + fade in | `ease-out` |
| 5 | Tarjeta mascota | 1.05 s | 0.85 s | `translateY(60px) scale(.82)` → overshoot `translateY(-10px) scale(1.03)` al 65% → reposo | `cubic-bezier(.2,1.3,.35,1)` |
| 6 | "ARTE" | 1.25 s | 0.55 s | `scale(.3) rotate(6deg)` → `scale(1.18) rotate(-20deg)` al 70% → `scale(1) rotate(-16deg)` | `cubic-bezier(.2,1.6,.4,1)` |
| 7 | "COLOR" | 1.40 s | 0.55 s | igual, reposo `rotate(-14deg)` | `cubic-bezier(.2,1.6,.4,1)` |
| 8 | Barra de carga | 1.70 s | 0.6 s | `translateY(18px)` + fade in | `ease-out` |
| 9 | Relleno de la barra | 1.80 s | 2.6 s | ancho 4% → 100% | `cubic-bezier(.5,.05,.3,1)` |
| 10 | Botón | 2.90 s | 0.5 s | `scale(.4)` → `scale(1.1)` al 70% → `scale(1)` | `cubic-bezier(.2,1.6,.4,1)` |

### Bucles (infinitos, tras la entrada)
- **Manchas de fondo:** deriva lenta, ver tabla arriba.
- **Halo de la tarjeta:** opacidad .35 ↔ .7, 4 s, `ease-in-out`.
- **Flotación de la mascota:** `translateY(0) rotate(-.6deg)` ↔ `translateY(-9px) rotate(.6deg)`,
  4.2 s, `ease-in-out`, empieza a los 1.9 s.
- **Sheen de la tarjeta:** barrido `translateX(-140%)` → `translateX(240%)` en el 55% del ciclo,
  luego pausa; ciclo 3.6 s, empieza a los 2.2 s.
- **Gota de pintura:** `translateY(-8px) scaleY(.6)` opacidad 0 → visible al 25% →
  `translateY(34px) scaleY(1.25)` opacidad 0; ciclo 1.6 s, `ease-in`, empieza a los 2.6 s.
  Debe detenerse cuando la carga llega al 100%.
- **Latido del botón:** `scale(1)` ↔ `scale(1.04)`, 2.4 s, `ease-in-out`, empieza a los 3.5 s.

### Comportamiento funcional
- El botón aparece al terminar la barra (≈3.4 s). Decidir en implementación si la barra refleja
  **carga real** (assets, sesión, permisos) o es un temporizador fijo. Recomendado: real, con
  mínimo de 2.5 s para que la animación se lea, y el botón habilitado solo al 100%.
- Tap en el botón → navegar a la primera pantalla del flujo (captura de rostro / onboarding).
- Toda la pantalla puede ser tappable tras el 100% (área generosa), manteniendo el botón como
  affordance visual.
- **Responsive:** el lienzo es 440×760. Escalar proporcionalmente por ancho; en pantallas más
  cortas, reducir primero los espacios (`margin-top` del titular/tarjeta) y el ancho de la
  tarjeta (262 → 220 px) antes de tocar los tamaños de fuente. Respetar safe areas
  (notch arriba, home indicator abajo).
- **Accesibilidad:** respetar `prefers-reduced-motion` / "Reducir movimiento" —
  mostrar el estado final sin entradas ni bucles. `alt` / labels: logo = "Pinturas Tito Pabón",
  mascota = "Mascota Tito Pabón". El botón necesita label accesible propio.
- Sin estados de error en este diseño. Si la carga falla, definir un estado aparte
  (no está diseñado aquí).

## State Management
Estado mínimo:
- `progress: number` (0–100) — avance de la carga; alimenta el ancho del relleno.
- `ready: boolean` — `progress === 100`; habilita/muestra el botón y detiene la gota.
- `reducedMotion: boolean` — desde la preferencia del sistema; si es true, saltar a estado final.
- (Opcional) `hasSeenSplash` persistido, si el splash debe acortarse en arranques posteriores.

Transiciones: `mount → loading (progress sube) → ready → tap → navigate`.
Data fetching: ninguno propio del splash; la barra puede engancharse a la inicialización real
(precarga de assets, restauración de sesión, permisos de cámara).

## Design Tokens

**Colores**
- Rojo marca: `#E4032E` · rojo botón claro `#F2143C` · rojo botón oscuro `#C40024` ·
  sombra botón `#8E0019`
- Ámbar: `#F7A600` · amarillos de fondo `#FFE79A`, `#FDD962`, `#F7C63F` ·
  sombra amarilla del titular `#d8ab2a`
- Turquesa: `#2FC3C9`, `#1FB6C4`, `#17A8B4`, `#1B9AA6`
- Magenta/rosa: `#EC0C7B`, `#C2076A`, `#F0369A`
- Violeta: `#A45BD6`, `#7C3FB0`
- Tinta: `#2B2118` · blanco `#FFFFFF` · texto atenuado `#7A5A16`
- Fondo del escenario (solo prototipo): `#0d0d0f`

**Espaciado** (px, usados tal cual): 2, 12, 22, 26, 30, 34
Padding de pantalla: `34px 30px 30px` · gap del bloque inferior: 12

**Tipografía**
- Display: **Anton** (400) — titular 56/52.6, palabras sueltas 29, botón 22
- Texto: **Barlow Condensed** (700, 800) — subtítulo 800 25px
- `letter-spacing`: titular .5px · botón 1.6px · palabras 0
- Falsa italic de marca: `skewX(-9deg)` en el titular

**Border radius:** 9999 (pill: barra y botón) · 34 (marco de pantalla, solo prototipo) ·
30 (tarjeta) · 40 (halo)

**Sombras**
- Tarjeta: `0 22px 44px rgba(150,95,0,.3), inset 0 0 0 1px rgba(255,255,255,.45)`
- Botón: `0 10px 0 #8E0019, 0 18px 30px rgba(140,0,25,.32)`
- Logo: `drop-shadow(0 6px 10px rgba(150,90,0,.28))`
- Titular rojo: `0 3px 0 rgba(255,255,255,.55), 0 10px 22px rgba(196,0,40,.28)`
- Titular blanco: `0 4px 0 #d8ab2a, 0 12px 26px rgba(120,80,0,.32)`

## Assets
| Archivo | Qué es | Origen | Estado |
|---------|--------|--------|--------|
| `assets/logo.png` | Logo "Pinturas Tito Pabón" (óvalo rojo + brocha) | **Recortado del mockup subido por el usuario** y con fondo eliminado programáticamente | ⚠️ Provisional — pedir el logo original (SVG o PNG con transparencia) antes de implementar |
| `assets/mascota.png` | Ilustración de la mascota de marca | **Recortada del mismo mockup**, arrastra el fondo amarillo del recorte | ⚠️ Provisional — pedir el original con transparencia |
| `uploads/imagen_...png` | Mockup de referencia original del usuario | Subido por el usuario | Referencia |

No se usan íconos ni ilustraciones vectoriales dibujadas a mano.
Fuentes desde Google Fonts: `Anton`, `Barlow+Condensed:wght@700;800`.
Si el codebase ya tiene un sistema de marca de Tito Pabón, usar sus tokens y sus assets
en lugar de los valores literales de aquí.

## Files
| Archivo | Contenido |
|---------|-----------|
| `Splash Tito Pabon.dc.html` | **Referencia principal.** El splash interactivo: markup, estilos inline y todos los `@keyframes`. Es la fuente de verdad para la implementación. |
| `Splash Video.dc.html` | Versión en línea de tiempo para exportar MP4/GIF de marketing. **No implementar.** |
| `splash-scene.jsx` | La composición del video como función del tiempo (`SplashVideo`). Útil solo como referencia de tiempos/easings; no es código de app. |
| `animations-v3.jsx` | Motor de animación del prototipo de video. Andamiaje — ignorar. |
| `support.js` | Runtime del entorno de prototipos. Andamiaje — ignorar. |
| `assets/` | Logo y mascota recortados (provisionales). |
| `uploads/` | Mockup original de referencia. |

## Notas para quien implemente
1. Reemplazar los dos assets recortados por los originales de marca — es el bloqueante principal.
2. Verificar los hex de marca contra el manual de identidad de Pinturas Tito Pabón;
   los de aquí se derivaron del mockup y pueden diferir del Pantone oficial.
3. Confirmar si la fuente display de la marca es Anton o una tipografía licenciada propia;
   Anton es una aproximación condensada gratuita.
4. Los tiempos de la secuencia (total ≈3.4 s hasta el botón) son el techo recomendado para un
   splash. Si la carga real es más rápida, no alargar artificialmente más allá de ~2.5 s.
5. Preferir animaciones nativas del framework (Reanimated, Flutter implicit animations,
   SwiftUI `withAnimation`) sobre traducciones literales de CSS.
