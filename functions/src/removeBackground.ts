// functions/src/removeBackground.ts
//
// Quita el fondo de una imagen con MODNet (matting de retratos, Apache-2.0)
// corriendo localmente dentro de la función vía transformers.js + ONNX —
// sin API externa ni costo por imagen.
//
// Se usa solo para el efecto "flotar en el espacio" de la imagen resultante
// (event.resultImageEffect === "SPACE_FLOAT"): el recorte es lo que se
// muestra flotando. La imagen para descargar/imprimir sigue siendo la
// original con fondo (`url` del doc de imageTasks).
import path from "path";
import sharp from "sharp";

const MODEL_ID = "Xenova/modnet";

type Modnet = {
  model: any;
  processor: any;
  RawImage: any;
};

// Una sola carga por instancia: el modelo (~25 MB, empaquetado en
// lib/assets/models) se lee en el arranque en frío y queda en memoria para
// las invocaciones siguientes. Si la carga falla, se descarta la promesa para
// reintentar en la próxima invocación en vez de quedar rota para siempre.
let modnetPromise: Promise<Modnet> | null = null;

function loadModnet(): Promise<Modnet> {
  if (!modnetPromise) {
    modnetPromise = (async () => {
      // Import dinámico: la librería (y onnxruntime) es pesada, y este
      // archivo lo carga el mismo index.ts que usan las demás funciones —
      // así solo lo paga la función que quita fondos.
      const { AutoModel, AutoProcessor, RawImage, env } = await import(
        "@huggingface/transformers"
      );
      // El modelo viaja empaquetado con la función (src/assets/models, que
      // `npm run build` copia a lib/assets) en vez de bajarse del Hub de
      // Hugging Face en cada arranque en frío: desde las IPs de Cloud
      // Functions el Hub responde 429 (rate limit a pedidos anónimos) y la
      // función quedaba sin modelo.
      env.localModelPath = path.join(__dirname, "assets", "models") + path.sep;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      // En Cloud Functions solo /tmp es escribible.
      env.cacheDir = "/tmp/transformers-cache";

      const [model, processor] = await Promise.all([
        AutoModel.from_pretrained(MODEL_ID, { dtype: "fp32" }),
        AutoProcessor.from_pretrained(MODEL_ID),
      ]);
      return { model, processor, RawImage };
    })().catch((err) => {
      modnetPromise = null;
      throw err;
    });
  }
  return modnetPromise;
}

/**
 * Devuelve un WebP con canal alfa: la persona (primer plano) opaca y el fondo
 * transparente, del mismo tamaño que la imagen de entrada. WebP y no PNG
 * porque solo se muestra en pantalla (nunca se descarga ni se imprime): el
 * PNG de un retrato 1024x1024 pesa ~3 MB, demasiado para el wifi de las
 * sedes; el WebP, una fracción.
 */
export async function removeBackground(input: Buffer): Promise<Buffer> {
  const { model, processor, RawImage } = await loadModnet();

  // Decodificar con sharp (ya dependencia del proyecto) a RGB crudo, en vez
  // de dejar que transformers.js lo haga por su cuenta.
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const image = new RawImage(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height,
    3
  );

  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });

  // `output` es el matte (0..1) a la resolución de trabajo del modelo;
  // se escala al tamaño original para usarlo como canal alfa.
  const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(
    info.width,
    info.height
  );

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .joinChannel(Buffer.from(mask.data), {
      raw: { width: info.width, height: info.height, channels: 1 },
    })
    .webp({ quality: 88, alphaQuality: 90 })
    .toBuffer();
}
