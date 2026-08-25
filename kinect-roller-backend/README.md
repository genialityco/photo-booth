# Kinect Roller Backend

Detecta un rodillo de pintura real apoyado sobre la pantalla, usando un
Kinect v2 montado encima apuntando hacia abajo, y transmite su posición por
WebSocket para usarlo como método de revelado de la imagen (en vez de
HAND_WIPE/ROLLER animados).

Por ahora este es solo el backend de detección + WebSocket. La integración
con el frontend (Next.js) queda para después.

## Dos métodos de detección (`--method`)

**`--method shape` (default)** detecta la **silueta del rodillo** (22x7cm)
directamente en la profundidad. Se probó también `--method hand` (trackear
la mano que sostiene el rodillo con MediaPipe, en vez de la forma del
rodillo) pero no dio buenos resultados en la práctica, así que se volvió a
`shape` como método principal; el código de `hand` queda disponible como
alternativa pero no es lo que corre por defecto.

**Corrección de geometría importante (2026-08-21):** el Kinect mira la
pantalla en ángulo rasante (a lo largo de su cara, no perpendicular a ella
— ver más abajo), así que una simple resta de profundidad
(`fondo - profundidad_actual`) **no mide la distancia real frente a la
pantalla** — se mezcla con la posición Y del punto, porque la profundidad
ya codifica esa posición. Un mismo objeto levantado 5cm frente a la
pantalla puede dar una diferencia de profundidad muy distinta según en qué
parte de la pantalla esté. Por eso ahora se ajusta un **plano 3D real** al
fondo calibrado (`src/screen_plane.py`, deproyección tipo pinhole + ajuste
por mínimos cuadrados/SVD) y se mide **distancia perpendicular** a ese
plano — así el filtro de "está a menos de 20cm de la pantalla" queda
realmente paralelo a la pantalla física en toda su extensión, sin importar
el ángulo de la cámara. Validado con una prueba sintética: la distancia
cruda de profundidad para un mismo levantamiento de 50mm variaba entre 66mm
y -1459mm según la posición Y; con distancia al plano se mantiene
consistente en ~50mm en todos los casos.

## Cómo funciona (`--method shape`, por defecto)

1. Se calibra una vez el **fondo**: una foto de profundidad de la pantalla
   vacía (`background_depth.npy`), y se ajusta un **plano 3D** a esos
   puntos (ver arriba).
2. En cada frame, se calcula la distancia perpendicular de cada píxel a ese
   plano, y se queda solo con la **franja** `background_diff_min_mm` a
   `mask_height_max_mm` (por defecto ~1cm a ~20cm frente a la pantalla) —
   no un umbral abierto, sino una franja acotada paralela a la pantalla.
   Esto es clave: una mano agarrando el rodillo sobresale más de la
   pantalla que el propio rodillo (dedos/nudillos por encima de sus ~7cm
   de diámetro), así que el límite superior de la franja excluye la mano
   de la máscara *antes* de buscar contornos — es lo que realmente separa
   "rodillo" de "mano sosteniendo el rodillo".
3. Denoise con apertura morfológica (kernel chico, quita ruido tipo sal y
   pimienta) y luego **cierre morfológico con un kernel más grande**
   (`morph_close_kernel_size`) para volver a unir el rodillo en un solo
   contorno cuando los dedos lo cruzan y lo cortan en varios pedazos — sin
   esto, un rodillo con la mano encima aparece como 2-3 fragmentos cortos
   en vez de una forma alargada. El cierre solo une por **cercanía en
   píxeles de la imagen**, sin saber qué tan lejos en mm está lo que rellena
   — así que la posición/tamaño **reportados** se calculan solo con los
   píxeles que sí están genuinamente dentro del rango configurado, nunca
   con la forma completa del contorno ya cerrado (si no, una mano bien
   fuera de la franja podía "arrastrar" la posición reportada con solo
   estar pegada en píxeles a un trocito válido del rodillo).
4. Se ajusta un rectángulo rotado (`cv2.minAreaRect`) a los píxeles de cada
   contorno que sí están dentro del rango, y se convierte su tamaño en
   píxeles a centímetros usando la
   profundidad medida en ese punto (proyección tipo pinhole). **Por
   defecto (`require_shape_match: false`) se acepta cualquier cosa dentro
   de la franja** — el contorno más grande se reporta como detección, sin
   exigir que la forma se parezca al rodillo. Esto es a propósito: el
   filtro por forma (`require_shape_match: true`, **área**
   `min_area_cm2`/`max_area_cm2` en cm² + **elongación** `min_elongation`)
   seguía sin detectar el rodillo de forma confiable incluso después del
   arreglo de geometría, así que por ahora se prioriza "detectar algo" por
   sobre "detectar exactamente la forma del rodillo". Actívalo de nuevo
   una vez que la detección básica (cualquier objeto) funcione bien y
   quieras volver a filtrar manos/brazos por forma.
5. **¿Está tocando la pantalla?** Un cilindro de diámetro D apoyado sobre un
   plano tiene su punto más cercano a la cámara siempre a una altura D sobre
   ese plano, sin importar dónde esté parado. Se usa la distancia
   perpendicular al plano del punto más cercano del candidato (restringida
   a los píxeles que sí estaban dentro de la franja original, para que un
   dedo "puenteado" por el cierre morfológico no contamine esta lectura)
   como aproximación de "qué tan levantado está" — si es cercana al
   diámetro del rodillo (~7 cm, configurable), se considera
   `touching = true`; si es mayor, está levantado.
6. El Kinect mira hacia abajo a lo largo de la cara de la pantalla desde
   arriba, no perpendicular a ella — así que **X** en pantalla es directo
   (columna de píxel, sin calibrar), pero **Y** (arriba/abajo en la
   pantalla física) queda codificado en la **profundidad**: los puntos
   cerca del borde superior de la pantalla (más cerca del Kinect) miden
   una profundidad chica, los del borde inferior una profundidad grande.
   `depth_top_mm`/`depth_bottom_mm` (calibrados una vez, ver "Uso") definen
   ese rango y se usa para mapear profundidad → Y normalizado `[0, 1]`. La
   profundidad de fondo que se usa para esto no se lee del píxel exacto
   (en rigs donde gran parte del cuadro no tiene lectura válida del Kinect,
   ese píxel exacto suele estar vacío y daba un Y fijo y sin sentido, sin
   importar cuánto movieras el rodillo) sino de una **curva por fila**
   interpolada/extrapolada a partir de las filas que sí tienen dato válido
   — así siempre hay un valor razonable, incluso en filas donde el Kinect
   nunca pudo leer nada directamente.
   Opcionalmente (`require_on_screen_y: true`, **`false` por defecto**),
   cualquier candidato cuyo Y calculado caiga muy fuera de `[0, 1]` (más
   allá de `screen_y_tolerance`) se descarta — así un brazo entrando por un
   costado nunca competiría con el rodillo real, sin necesitar un polígono
   ni 4 esquinas. Está apagado por defecto porque este Y depende de que los
   2 clics de `--calibrate-depth` hayan caído exactamente en el borde
   superior/inferior real — si quedaron cerca uno del otro o no cubren todo
   el alto de la pantalla, este filtro puede rechazar el rodillo en
   *cualquier* posición. Actívalo solo después de confirmar (en `--debug`)
   que el valor `y=` se mantiene dentro de `[0,1]` mientras mueves el
   rodillo por toda la pantalla.

Sin calibrar `depth_top_mm`/`depth_bottom_mm` (`--calibrate-depth` sin correr
todavía), Y cae de vuelta a la fila de imagen (no va a coincidir con la
pantalla real).

## Referencia completa de `config.json`

Todos los campos, en el orden en que se aplican dentro de `detect()`
(`roller_detector.py`), con qué hace cada uno y — importante — con qué otros
campos interactúa o se solapa. Verificado leyendo el código, no de memoria:
varios de estos solapamientos son fáciles de introducir sin darse cuenta al
ajustar un solo valor.

### ⚠️ Antes que nada: combinaciones que rompen todo en silencio

- **`background_diff_min_mm` debe ser MENOR que `mask_height_max_mm`,
  con margen.** La franja de detección es `dist > background_diff_min_mm AND
  dist <= mask_height_max_mm`. Si son iguales (o el mínimo es mayor), esa
  condición **nunca** se cumple para ningún píxel — cero detecciones
  posibles, sin importar qué tan pegado esté el rodillo. No hay ningún log
  ni error que avise de esto; se ve exactamente igual que "el rodillo no se
  detecta" por cualquier otra razón.
- **`mask_height_max_mm` debe quedar por ENCIMA del diámetro real del
  rodillo** (`roller_width_cm * 10`, ej. 70mm para un rodillo de 7cm) **más
  un margen** (unos 20-30mm). Si queda por debajo, la franja tapa la propia
  cresta superior del rodillo apoyado, no solo la mano — el rodillo mismo
  deja de ser detectable. Este invariante NO está validado por código, es
  solo un comentario — `config.json` acepta cualquier valor sin avisar.
- **`touch_height_min_mm` casi nunca puede ser menor que
  `background_diff_min_mm`, así que ponerlo por debajo no cambia nada.**
  `top_height_mm` (lo que se compara contra `touch_height_min_mm`/`_max_mm`)
  se calcula como el percentil 95 de la distancia al plano **de los mismos
  píxeles ya filtrados** por `background_diff_min_mm`/`mask_height_max_mm` —
  o sea que `top_height_mm` nunca puede bajar de `background_diff_min_mm`
  en la práctica. Si `touch_height_min_mm` queda por debajo de ese valor,
  es un número muerto: la condición ya se cumple sola.
- **`touch_height_max_mm` debe quedar por DEBAJO de `mask_height_max_mm`.**
  Si lo superás, esa parte del rango de "tocando" es inalcanzable — nunca
  va a llegar un candidato con esa altura porque ya se descartó antes, en
  la franja de detección.
- **`plane_offset_mm` desplaza el punto cero de TODOS los demás umbrales en
  mm** (`background_diff_min_mm`, `mask_height_max_mm`,
  `touch_height_min_mm`, `touch_height_max_mm`) — se resta de `dist` antes
  de que se compare contra cualquiera de ellos. Si cambiás
  `plane_offset_mm`, los demás umbrales dejan de significar lo que
  significaban antes; revisalos de nuevo con `--debug`.

### Cámara / geometría (fundamentales — no tocar sin remedir)

- **`depth_width` / `depth_height`** (512×424) — resolución del stream de
  profundidad del Kinect v2. Fija, no cambia entre rigs.
- **`focal_length_px`** (365.6) — distancia focal aproximada, valores
  promedio de fábrica del Kinect v2. Se usa para convertir tamaños en
  píxeles a centímetros reales (proyección pinhole) y como centro óptico
  (`cx`/`cy` = mitad de `depth_width`/`depth_height`) al ajustar el plano de
  pantalla. Cambiarlo sin recalibrar desajusta tanto los tamaños reportados
  (`length_cm`/`width_cm`) como el ajuste del plano mismo.
- **`roller_length_cm` / `roller_width_cm`** (22.0 / 7.0) — dimensiones
  reales del rodillo físico. Solo se usan programáticamente cuando
  `require_shape_match: true` (para el área nominal de comparación,
  `_pick_best`). Con `require_shape_match: false` (default) son
  informativos: la única función real que cumplen es la advertencia en
  comentarios de que `mask_height_max_mm` debe superar `roller_width_cm*10`
  — ver arriba.

### Ajuste del plano de pantalla (`screen_plane.py`)

- **`plane_fit_use_full_depth`** (`false`) — con `depth_top_mm`/
  `depth_bottom_mm` ya calibrados, el ajuste del plano por defecto solo usa
  puntos del fondo dentro de ese rango de profundidad (± margen), para que
  piso/pared/muebles fuera de rango no contaminen el ajuste. `true` ignora
  esa restricción y usa todo el fondo válido. **Solapa con el rango
  calibrado**: en cuartos grandes donde piso/pared caen DENTRO del mismo
  rango de profundidad amplio que la pantalla, ninguno de los dos valores
  cambia mucho el resultado (la restricción por profundidad deja de
  discriminar) — mirá el `inlier_ratio` en consola al arrancar para
  confirmar si de verdad está ayudando.
- **`plane_offset_mm`** (0.0) — ver arriba, desplaza el punto cero de todos
  los demás umbrales en mm.
- **`max_raw_depth_mm`** (3500.0 en tu config actual) — filtro grueso en Z
  **crudo** (distancia real al sensor), no en distancia al plano. Se aplica
  DESPUÉS de calcular `dist` pero es independiente de
  `background_diff_min_mm`/`mask_height_max_mm` (esos usan `dist`, este usa
  `depth` crudo) — pensado para descartar algo lejos del Kinect cuya altura
  respecto al plano ajustado caiga en rango por casualidad (plano mal
  ajustado). No reemplaza un buen `inlier_ratio`, es una red de seguridad
  extra sobre eso.

### Franja de detección (qué cuenta como "posible rodillo")

- **`background_diff_min_mm`** (mínimo) y **`mask_height_max_mm`** (máximo)
  — juntos acotan la franja de distancia-al-plano que cuenta como
  candidato. Ver la advertencia de arriba sobre mantenerlos con margen
  entre sí y `mask_height_max_mm` por encima del diámetro del rodillo.
- **`min_contour_area_px`** (80) — piso de ruido en PÍXELES, se aplica
  **siempre**, sin importar `require_shape_match`. No es lo mismo que
  `min_area_cm2` (ver abajo): este actúa antes, en píxeles crudos, solo
  para descartar motas de ruido del sensor; no intenta parecerse al tamaño
  real del rodillo.
- **`stale_suppress_enabled`** / **`stale_suppress_seconds`** (`true` /
  15.0 por defecto, actualmente `false` en tu config) — descarta cualquier
  región que lleve más de `stale_suppress_seconds` **continuamente** en la
  franja (objetos quietos: muebles, un rodillo abandonado ahí). Se aplica
  ANTES de la morfología/contornos, así que un objeto suprimido no genera
  ningún candidato en absoluto ese frame. Ver la sección dedicada más abajo.

### Morfología (limpieza de la máscara binaria)

- **`morph_open_kernel_size`** / **`morph_open_iterations`** (3 / 1) —
  kernel chico para quitar ruido tipo sal-y-pimienta. **Cuidado**: si el
  rodillo aparece genuinamente delgado en la imagen en algún punto (ej.
  cerca del borde del rango calibrado, donde la franja visible de pantalla
  puede ocupar pocas filas), un kernel de apertura demasiado grande puede
  borrar esa detección real junto con el ruido — no solo afecta ruido.
- **`morph_close_kernel_size`** / **`morph_close_iterations`** (15 / 2) —
  kernel más grande para volver a unir el rodillo cuando los dedos lo
  cortan en varios pedazos. Actúa **después** de la apertura, sobre lo que
  haya sobrevivido — si la apertura ya borró el rodillo, el cierre no tiene
  nada que reunir. Solo une por cercanía en píxeles, sin saber a qué
  distancia real (mm) está lo que rellena — por eso posición/tamaño
  reportados se calculan solo con los píxeles genuinamente dentro de la
  franja, nunca con la forma ya cerrada.

### Filtro por forma (todo este bloque es inerte si `require_shape_match: false`)

- **`require_shape_match`** (`false`) — interruptor maestro de este bloque.
  En `false` (el estado actual recomendado), **ninguno** de los siguientes
  tres campos tiene ningún efecto — podés cambiarlos sin que pase nada
  hasta que actives esto.
- **`min_area_cm2`** / **`max_area_cm2`** (35.0 / 260.0) — rango de área en
  cm² (no píxeles — convertido vía profundidad). Solo se evalúa con
  `require_shape_match: true`.
- **`min_elongation`** (1.3) — relación largo/ancho mínima del rectángulo
  ajustado, para rechazar blobs muy redondos (puño, yema de dedo). Solo con
  `require_shape_match: true`.

### Filtro por posición en pantalla (inerte si `require_on_screen_y: false`)

- **`require_on_screen_y`** (`false`) — interruptor maestro.
- **`screen_y_tolerance`** (0.15, actualmente `1` en tu config — con ese
  valor el filtro prácticamente no rechaza nada aunque se active, ya que
  tolera estar hasta un 100% fuera de `[0,1]`) — solo se evalúa con
  `require_on_screen_y: true` **y** con `depth_top_mm`/`depth_bottom_mm` ya
  calibrados.

### Y en pantalla (`_to_screen_norm`)

- **`y_sensitivity`** (1.0) y **`y_span_scale`** (1.0) — ambos reescalan Y,
  pero con matemática distinta y se **componen** (no son alternativos): el
  span calibrado se multiplica por `y_span_scale` primero (cambia el
  denominador, sin techo), y el resultado se comprime alrededor de 0.5 por
  `y_sensitivity` después (con techo matemático — ver la nota en
  `config.py`). Para la mayoría de los casos alcanza con uno solo de los
  dos; usar ambos a la vez es más difícil de razonar. Ninguno de los dos
  hace nada sin `depth_top_mm`/`depth_bottom_mm` calibrados.

### "¿Está tocando?"

- **`touch_height_min_mm`** / **`touch_height_max_mm`** (35.0 / 110.0) —
  banda de `top_height_mm` (altura del punto más alto del candidato sobre
  el plano) que cuenta como "apoyado". Ver las dos advertencias de
  solapamiento con `background_diff_min_mm`/`mask_height_max_mm` al
  principio de esta sección — son las que más fácil rompen sin avisar.

### Modo `--method hand` (alternativo, NO es el default — todo este bloque es inerte en modo `shape`)

- **`hand_max_num_hands`**, **`hand_min_detection_confidence`**,
  **`hand_min_tracking_confidence`**, **`hand_touch_min_mm`**,
  **`hand_touch_max_mm`** — configuración de MediaPipe y del gate de
  "tocando" para el modo de tracking de mano. Ninguno de estos afecta el
  modo `shape` (el default, y el que está documentado en detalle arriba).

### Fuera del pipeline de detección (no afectan qué se detecta)

- **`background_capture_frames`** (30) — solo usado al capturar el fondo
  (`--calibrate-bg`/`--calibrate-depth`), cuántos frames promediar. No
  afecta la detección en vivo.
- **`ws_host`** / **`ws_port`** / **`broadcast_fps`** — solo la parte de
  red (dónde escucha el WebSocket, cuántas veces por segundo transmite).
  Sin relación con qué cuenta como detección.
- **`depth_view_min_mm`** / **`depth_view_max_mm`** (400.0 / 1500.0) —
  **solo afectan el colormap de `--debug`** (qué tan lejos hay que estar
  para que el color se vea "rojo tope" en vez de variar). Cero efecto en la
  detección real — es un error común pensar que esto limita qué tan lejos
  detecta el sistema; no lo hace. Ver el ejemplo con `colorize_depth` en la
  sección de troubleshooting más abajo si la vista de profundidad se ve
  "aplastada" (todo rojo a partir de cierta distancia).

### Supresión de objetos quietos (`stale_suppress_seconds`)

Cualquier zona que se lea como "diferente al fondo" de forma **continua**
por más de `stale_suppress_seconds` (default `15.0`) se ignora. Esto se
aplica parejo en toda la franja (tocando y flotando por igual) — una
versión anterior solo lo aplicaba a la zona de "flotando", exceptuando la
de "tocando" para no cortar un uso normal sostenido, pero eso significaba
que un objeto quieto que justo cae en la altura de "tocando" (muy probable
— es una altura común para muebles/objetos) nunca se suprimía, así que el
problema seguía ahí. Ahora se trata igual sin importar la altura.

Esto es intencionalmente un instrumento tosco: solo con profundidad no hay
forma de distinguir "alguien sostiene el rodillo apoyado a propósito" de
"un objeto quieto siempre en el mismo lugar" — la única señal disponible es
el **tiempo**. Por eso el default es generoso (15s): más que cualquier
pausa razonable al pintar, pero corto comparado con "esto lleva ahí toda la
sesión". Si tu gesto de revelado incluye sostener el rodillo perfectamente
quieto por más de 15s seguidos, sube este valor; si algo quieto tarda
demasiado en desaparecer, bájalo. Se puede desactivar del todo con
`"stale_suppress_enabled": false`.

**La solución real y permanente sigue siendo un buen fondo/plano
calibrado** (revisa el `inlier_ratio` que se imprime en consola al ajustar
el plano — si es bajo, el Kinect está viendo mucho más que la pantalla).
Esta supresión es una red de seguridad encima de eso, no un reemplazo.

## Cómo funciona (`--method hand`, alternativo — no es el default)

1. Se calibra una vez el **fondo**: una foto de profundidad de la pantalla
   vacía (`background_depth.npy`).
2. MediaPipe Hands procesa el frame de **color** del Kinect (1920x1080) y
   ubica la mano; se usa el centro de la palma (promedio de muñeca + 4
   nudillos base) como punto de la mano.
3. Ese punto (en espacio de color) se mapea a espacio de profundidad con el
   `CoordinateMapper` del Kinect (`MapColorFrameToDepthSpace`), dando la
   profundidad real en ese punto.
4. **¿Está tocando?** Se compara esa profundidad contra el fondo calibrado
   en el mismo punto: `diff = fondo - profundidad_mano` (nota: a diferencia
   de `shape`, este modo todavía no usa la distancia al plano 3D, así que
   tiene el mismo problema de geometría descrito arriba — pendiente si se
   retoma este método). Si `diff` cae en
   `[hand_touch_min_mm, hand_touch_max_mm]` se considera `touching = true`.
5. Posición en pantalla: igual que en `shape` (X directo, Y por
   profundidad). Ver `src/hand_roller_detector.py`.

## Instalación

Requiere **Windows** + **Kinect for Windows SDK 2.0** instalado (los DLLs
nativos que usa `pykinect2`; no se instalan por pip). Descárgalo de
Microsoft si no lo tienes.

```bash
cd kinect-roller-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python patch_pykinect2.py
```

### Notas conocidas sobre `pykinect2`

Es un paquete de PyPI viejo, escrito para Python 2.7/3.x de 32 bits, que
falla de varias formas en un Python 64 bits moderno. `patch_pykinect2.py`
corrige automáticamente (parcheando los archivos dentro de tu venv,
`site-packages\pykinect2\...`) los tres problemas conocidos:

- `AssertionError: 80` en `tagSTATSTG` (`PyKinectV2.py`) — el struct
  `tagSTATSTG` legítimamente mide 80 bytes en 64 bits (no 72 como en 32
  bits, por un campo puntero); es un struct de OLE storage sin relación con
  el sensor, así que el chequeo se desactiva.
- `ImportError: Wrong version` de `comtypes._check_version` — compara
  contra la versión interna del generador de código de `comtypes`, no
  contra nada de Kinect; siempre falla con comtypes moderno, así que se
  desactiva.
- `AttributeError: module 'time' has no attribute 'clock'` — `time.clock()`
  se eliminó en Python 3.8+; se reemplaza por `time.perf_counter()`.

Corre `python patch_pykinect2.py` de nuevo cada vez que reinstales o
recrees el entorno virtual (es seguro ejecutarlo varias veces, detecta si
ya está parcheado).

Si además ves un `AttributeError` de numpy (`np.float`, `np.int`, etc.) al
importar `pykinect2`, es porque numpy >= 1.24 eliminó esos alias —
`requirements.txt` ya fija `numpy<2.0` para evitarlo.

### Nota sobre `mediapipe` (solo si usas `--method hand`, ya no es el default)

`requirements.txt` fija `mediapipe==0.10.21` a propósito: mediapipe 1.0+
eliminó la API clásica `mediapipe.solutions.hands` que usa este proyecto (y
`realsensemptouch`) en favor de una API basada en archivos `.task`. Si ves
`AttributeError: module 'mediapipe' has no attribute 'solutions'`, tienes
una versión más nueva instalada — reinstala con
`pip install mediapipe==0.10.21`. Mediapipe también arrastra su propia
versión de numpy si no está ya instalado; si eso te sube numpy a 2.x y rompe
`pykinect2`, corre `pip install "numpy<2.0"` después.

### Probar sin Kinect (modo mock)

Todo el pipeline (detección, WebSocket, vista debug) funciona sin hardware
usando `--mock`:

```bash
python -m src.main --mock --debug                  # modo shape (rodillo sintético simulado)
python -m src.main --mock --debug --method hand  # modo hand (usa la webcam si hay una)
```

En modo `hand` + `--mock`, se usa la webcam de la máquina (si existe) como
feed de color para probar la detección de mano de verdad; la "profundidad"
sigue siendo sintética (no hay correspondencia física real entre lo que ve
la webcam y el rango de profundidad simulado), así que sirve para probar
que MediaPipe encuentra la mano y que el resto del pipeline no se cae, no
para validar el touch detection real.

## Uso

**Importante:** `--calibrate-bg` captura literalmente lo que el Kinect vea
en ese momento como "la pantalla vacía" — si hay una persona, un objeto, o
la cámara todavía no está bien apuntada a la pantalla, ese ruido queda
grabado como si fuera parte del fondo y arruina toda la detección después
(ajuste de plano incluido). Asegúrate de que la pantalla esté realmente
vacía y el Kinect bien montado/apuntado antes de correr esto.

Al hacer clic en `--calibrate-depth` (arriba/abajo de la pantalla), si el
punto exacto donde hiciste clic no tiene lectura de profundidad válida (un
"hueco" del sensor, común cerca de bordes), el clic se rechaza — verás un
mensaje en rojo en la ventana y en la consola pidiéndote hacer clic en otro
punto, en vez de guardar silenciosamente un valor de 0mm que rompería la
calibración más adelante.

```bash
# --calibrate-depth ya captura el fondo de nuevo por defecto (además de
# pedir el clic en el borde superior e inferior de la pantalla) - normalmente
# basta correr solo esto, con la pantalla vacía y el Kinect ya bien apuntado:
python -m src.main --calibrate-depth

# --calibrate-bg por separado sigue disponible si solo quieres refrescar el
# fondo sin tocar el rango de profundidad ya calibrado:
python -m src.main --calibrate-bg

# Si ya tienes un fondo bueno y solo quieres repetir el clic de arriba/abajo
# sin recapturarlo, agrega --keep-bg:
python -m src.main --calibrate-depth --keep-bg

# Correr con vista de depuración (ver qué ve el Kinect y cómo detecta).
# Usa --method hand para el método alternativo con MediaPipe.
python -m src.main --debug

# Correr en modo servicio (solo logs + WebSocket, sin ventanas)
python -m src.main
```

Atajos en la ventana de debug (ambos métodos): `q` salir, `b` re-calibrar
fondo, `c` re-calibrar el rango de profundidad (clic arriba, clic abajo). En
`--method shape` además `d` volcar a la consola el detalle de todos los
candidatos del frame actual (posición, área, elongación, alto,
aceptado/rechazado y por qué) — más fácil de leer que el texto superpuesto
en la imagen. La vista de profundidad ahí resalta en amarillo translúcido
los píxeles cuya profundidad cae dentro del rango calibrado, para confirmar
de un vistazo que cubre justo la pantalla. En `--method hand`, la ventana
muestra el feed de color con un punto verde (tocando) o naranja (en el
aire) sobre la mano detectada, con un panel chico de profundidad en la
esquina para referencia.

Todos los parámetros (banda de altura, área/elongación, umbrales de
"tocando", tamaños de kernel morfológico, host/puerto del WebSocket, etc.)
están en `config.json`, generado con valores por defecto en el primer
arranque. Los archivos de calibración (`calibration.json`,
`background_depth.npy`) son específicos del montaje físico y están en
`.gitignore` — no se versionan. `--config`/`--calibration-file`/
`--background-file` permiten apuntar a copias separadas de estos tres
archivos (útil para probar sin pisar tu calibración real).

## Mensaje WebSocket

Servidor WebSocket de solo transmisión (los clientes no necesitan enviar
nada) en `ws://<host>:8765` por defecto. Cada detección aceptada se
transmite como:

**`--method shape`** (default):
```json
{
  "type": "roller",
  "touching": true,
  "x": 0.42,
  "y": 0.63,
  "angle_deg": 37.5,
  "length_cm": 21.6,
  "width_cm": 6.9,
  "height_mm": 71.0,
  "timestamp": 1755787200.123
}
```
`angle_deg` (rotación del rodillo 0-180°) y `length_cm`/`width_cm` solo
existen en este método, ya que vienen de ajustar un rectángulo a la
silueta detectada. `height_mm` es la distancia perpendicular al plano de
la pantalla (ver arriba).

**`--method hand`**:
```json
{
  "type": "roller",
  "touching": true,
  "x": 0.42,
  "y": 0.63,
  "hand": "Right",
  "height_mm": 45.0,
  "timestamp": 1755787200.123
}
```
`height_mm` aquí es el `diff` (fondo - profundidad de la mano), no la altura
real del rodillo.

En ambos: `x`, `y` posición normalizada `[0, 1]` sobre la pantalla;
`touching` si está apoyado (vs. en el aire). Cuando deja de detectarse tras
haber sido visto, se envía una vez
`{"type": "roller", "touching": false, "lost": true, "timestamp": ...}`.

## Ajuste fino: `--method shape`

Con `--debug`, presiona `d` para volcar a la consola todos los candidatos
del frame (aceptados y rechazados, con su razón). Eso te dice exactamente
qué ajustar:

- **No detecta nada, panel de máscara casi vacío** → con
  `require_shape_match: false` (default) esto ya casi no debería pasar,
  cualquier cosa en la franja de 20cm cuenta. Si aun así no aparece nada,
  sube `mask_height_max_mm` (probablemente la franja está mal calibrada) y/o
  baja `background_diff_min_mm`; confirma también que `--calibrate-bg` se
  corrió con la pantalla realmente vacía (un fondo mal capturado hace que
  todo, incluida la pantalla vacía, parezca "diferente al fondo").
- **Detecta objetos quietos que no se mueven** → con
  `stale_suppress_enabled: true` (default) deberían dejar de detectarse
  solos tras `stale_suppress_seconds` (default 15s); baja ese valor si
  tardan mucho en desaparecer. Si siguen apareciendo indefinidamente, revisa
  también el ajuste del plano (`screen_plane.py`): corre `--calibrate-bg`
  de nuevo (pantalla realmente vacía, Kinect bien apuntado) y mira el
  `inlier_ratio` que se imprime en consola — si es bajo, el Kinect está
  viendo mucho más que la pantalla, y ninguna supresión por tiempo
  reemplaza un buen fondo calibrado.
- **`plane_fit_use_full_depth`** → por defecto (`false`), una vez calibrado
  `depth_top_mm`/`depth_bottom_mm`, el ajuste del plano solo usa puntos del
  fondo dentro de ese rango de profundidad (± margen) — ayuda cuando la
  pantalla es una fracción chica de lo que ve el Kinect. Ponlo en `true`
  para ajustar el plano con **todo** el fondo válido, ignorando ese rango —
  útil si el rango calibrado quedó mal (los 2 clics muy cerca entre sí, o
  gran parte de la pantalla fuera del rango que el Kinect puede leer).
  **Ojo:** esto no siempre ayuda — si el resto del fondo fuera de ese rango
  es en realidad piso/pared/otra superficie (no la pantalla), usar todo el
  fondo puede *empeorar* el ajuste del plano en vez de mejorarlo. Compara el
  `inlier_ratio` en consola con `true` y `false` antes de dejarlo activado.
- **`plane_offset_mm`** (default `0.0`) → se resta a la distancia calculada
  al plano *antes* de aplicar `background_diff_min_mm`/`mask_height_max_mm`/
  los umbrales de "tocando". Un ajuste manual del punto cero ("qué cuenta
  como exactamente sobre la pantalla") sin tener que recalibrar todo — si
  con la pantalla realmente vacía ves en `--debug`/`d` que igual reporta
  una distancia `h=` chica pero no-cero en vez de ~0mm (el plano ajustado no
  cae justo en la superficie real), pon ese valor acá. Positivo = empuja el
  punto cero más lejos (usar cuando el plano lee todo "más cerca" de lo
  real); negativo = lo acerca.
- **`max_raw_depth_mm`** (default `1900.0`) → filtro grueso en Z **crudo**
  (distancia real al sensor, no la distancia al plano como `plane_offset_mm`/
  `mask_height_max_mm` arriba): descarta de entrada cualquier píxel más lejos
  que esto, antes de cualquier otro cálculo. Pensado para gente caminando de
  fondo, lejos de la pantalla, cuya altura respecto al plano ajustado podría
  caer en rango por casualidad y colarse como detección. Bajalo si necesitás
  ser más estricto con qué tan lejos puede estar algo para contar.
- **`y_sensitivity`** (default `1.0`) → **si Y varía demasiado** (un
  movimiento chico del rodillo mueve Y casi de 0 a 1) → esto pasa cuando el
  rango de profundidad calibrado es angosto (los 2 clics de
  `--calibrate-depth` quedaron cerca uno del otro, o el rango real de tu
  pantalla es angosto por el montaje — ver "Cómo funciona" arriba).
  Súbelo (ej. `2.0`, `4.0`) para calmar la sensibilidad — reescala Y
  alrededor del centro (0.5), así hace falta más movimiento físico real
  para cubrir el mismo rango reportado. No arregla la calibración angosta
  de fondo, solo la compensa sin tener que recalibrar. Ajusta mirando el
  valor `y=` en `--debug` mientras mueves el rodillo una distancia conocida
  y cómoda.
  **OJO — tiene un techo matemático**: como reescala alrededor del centro
  (0.5), a partir de cierto valor los extremos 0 y 1 (arriba/abajo de toda
  la imagen) quedan matemáticamente inalcanzables por más que muevas el
  rodillo — la salida comprimida nunca termina de cerrar la distancia al
  extremo. Si necesitás MÁS movimiento físico para cubrir toda la imagen
  pero sin perder la capacidad de llegar a los extremos, usá
  `y_span_scale` en su lugar (dejando `y_sensitivity` en `1.0`).
- **`y_span_scale`** (default `1.0`) → mismo síntoma que arriba (Y cubre
  toda la imagen con muy poco movimiento real) pero sin el techo de
  `y_sensitivity`: multiplica el span calibrado (`depth_bottom_mm -
  depth_top_mm`) usado para normalizar Y, anclado en `depth_top_mm` — no
  comprime alrededor de un centro, así que el `[0,1]` completo sigue
  siendo alcanzable a cualquier valor, solo que hace falta
  proporcionalmente más recorrido físico real para llegar. Ejemplo: si hoy
  con 20cm de movimiento ya cubrís una pantalla de ~80cm de alto, poné
  `4.0` (80/20) para que haga falta cerca de los 80cm completos. Ajustá
  mirando `y=` en `--debug`, confirmando que 0 y 1 siguen siendo
  alcanzables en los extremos físicos reales.
- **Detecta cosas que no son el rodillo (manos, brazos, ruido)** → esto es
  esperado con `require_shape_match: false`, ya que acepta cualquier cosa
  en la franja. Opciones, de más simple a más estricta:
  - Pon `"require_on_screen_y": true` en `config.json` (con
    `--calibrate-depth` ya corrido) — filtra por posición en pantalla, útil
    contra brazos entrando desde fuera de la pantalla. Ver el punto de
    abajo si esto termina rechazando todo en vez de solo lo de afuera.
  - Pon `"require_shape_match": true` en `config.json` para volver a exigir
    área/elongación parecidas al rodillo (ver los puntos de abajo para
    ajustar esos valores) — vuelve a activar el riesgo de no detectar nada
    si la mano fragmenta demasiado el rodillo.
- **"y=X.XX off-screen" en todos lados, no importa dónde pongas el
  rodillo** (solo posible con `require_on_screen_y: true`) → los 2 clics de
  `--calibrate-depth` quedaron muy cerca uno del otro, o no cubren el alto
  real de la pantalla, así que el rango calibrado es demasiado angosto —
  cualquier desviación normal se sale de `[0,1]` amplificada. Vuelve a
  correr `--calibrate-depth` clickeando bien el borde superior y el
  inferior reales (lo más separados posible), o simplemente pon
  `"require_on_screen_y": false` (el default) si no necesitas este filtro.
- **"area Xcm2 too small/too large"** (solo con `require_shape_match: true`)
  → ajusta `min_area_cm2`/`max_area_cm2`. Si la mano ocluye mucho del
  rodillo, bájale el mínimo; si están pasando manos/brazos, bájale el
  máximo.
- **"elongation X too round"** (solo con `require_shape_match: true`) → el
  blob detectado es muy redondo (un puño, la yema de un dedo). Si el
  rodillo real casi nunca se ve así, sube `min_elongation`; si tu rodillo
  queda muy fragmentado y los pedazos visibles son casi cuadrados,
  considera subir `morph_close_kernel_size` en vez de bajar este valor (el
  problema real es que no se están uniendo los fragmentos).
- **Sigue viéndose fragmentado en 2-3 pedazos pequeños en el panel de
  máscara** → sube `morph_close_kernel_size` (bridging insuficiente entre
  los huecos que dejan los dedos) y/o `morph_close_iterations`.
- **La mano sigue mezclada con el rodillo en un solo blob ancho** → baja
  `mask_height_max_mm` (pero **nunca por debajo de `roller_width_cm*10 + margen`**,
  ej. no bajes de ~90-100mm para un rodillo de 7cm de diámetro — si lo
  bajas demasiado, cortas el propio rodillo, no la mano).

`touch_height_min_mm` / `touch_height_max_mm` definen la banda de distancia
al plano que se considera "apoyado" (vs. "levantado, aún no toca"). Por
defecto asumen un rodillo de ~7 cm de diámetro con tolerancia. Si tu rodillo
real tiene otro diámetro, ajusta `roller_width_cm` y esta banda en
consecuencia, observando en `--debug`/`d` el valor `h=` (distancia al plano
en mm) que reporta cuando el rodillo está físicamente tocando la pantalla.

## Ajuste fino: `--method hand`

- **No detecta ninguna mano** → confirma que ves el feed de color en
  `--debug` (si sale negro, la cámara de color no está llegando — revisa
  que `enable_color`/el Kinect esté bien conectado). Baja
  `hand_min_detection_confidence` en `config.json` si la mano se ve pero no
  se marca.
- **Detecta la mano pero nunca marca `touching`** → mira el valor `diff=`
  en pantalla mientras apoyas el rodillo de verdad; ajusta
  `hand_touch_min_mm`/`hand_touch_max_mm` en `config.json` para que ese
  rango cubra el `diff` que ves al tocar.
- **Marca `touching` todo el tiempo, incluso con el rodillo en el aire** →
  `hand_touch_max_mm` demasiado alto; bájalo mirando el `diff=` real al
  levantar el rodillo.
- **La posición se siente rara/no coincide con la pantalla** → corre
  `--calibrate-depth` si no lo has hecho.
