#!/usr/bin/env node
/**
 * Script para generar firebaseServiceAccount.json desde variable de entorno o Secret Manager
 * Se ejecuta antes del build de Next.js
 */

const fs = require("fs");
const path = require("path");

// Ruta absoluta del archivo (en .next para que Netlify lo incluya)
const rootDir = __dirname;
const nextDir = path.join(rootDir, ".next");
const filePath = path.join(nextDir, "firebaseServiceAccount.json");

// Crear directorio .next si no existe
if (!fs.existsSync(nextDir)) {
  fs.mkdirSync(nextDir, { recursive: true });
}

console.log(`📍 Generando credenciales en: ${filePath}`);

// Si el archivo ya existe y es válido, no hacer nada
if (fs.existsSync(filePath)) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    JSON.parse(content);
    console.log("✓ firebaseServiceAccount.json ya existe y es válido");
    process.exit(0);
  } catch (err) {
    console.warn("⚠️ Archivo inválido, regenerando...");
  }
}

async function generateFromSecretManager() {
  try {
    const gcloudKey = process.env.GCLOUD_KEY;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "472633703949";
    
    if (!gcloudKey) {
      console.warn("⚠️ GCLOUD_KEY no disponible");
      return null;
    }

    // Parsear la key de Google Cloud
    const serviceAccountKey = JSON.parse(gcloudKey);

    // Para usar Secret Manager en build time, necesitaríamos el SDK de Google Cloud
    // Lo dejamos para que los API routes lo manejen en runtime
    console.log("ℹ️ Secret Manager será usado en runtime por los API routes");
    return null;
  } catch (err) {
    console.warn("⚠️ No se pudo acceder a Secret Manager:", err.message);
    return null;
  }
}

async function main() {
  // 1️⃣ Si GCLOUD_KEY existe, escribir como archivo para que GOOGLE_APPLICATION_CREDENTIALS lo use
  if (process.env.GCLOUD_KEY) {
    try {
      const gcloudKeyPath = path.join(nextDir, "gcloud-key.json");
      fs.writeFileSync(gcloudKeyPath, process.env.GCLOUD_KEY, "utf-8");
      
      // Validar que es JSON válido
      JSON.parse(process.env.GCLOUD_KEY);
      
      console.log("✓ gcloud-key.json guardado para Secret Manager");
      
      // Setear variable de entorno para que el cliente de Secret Manager la use
      process.env.GOOGLE_APPLICATION_CREDENTIALS = gcloudKeyPath;
    } catch (err) {
      console.warn("⚠️ Error guardando gcloud-key.json:", err.message);
    }
  }

  // 2️⃣ Intentar con FIREBASE_SERVICE_ACCOUNT (Base64)
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (encoded) {
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const credentials = JSON.parse(decoded);
      
      fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf-8");
      console.log("✓ firebaseServiceAccount.json generado desde FIREBASE_SERVICE_ACCOUNT");
      
      const content = fs.readFileSync(filePath, "utf-8");
      JSON.parse(content);
      console.log("✓ Archivo validado correctamente");
      return;
    } catch (err) {
      console.warn("⚠️ Error con FIREBASE_SERVICE_ACCOUNT:", err.message);
    }
  }

  // 3️⃣ Si ninguno funciona, continuar (los API routes lo manejarán en runtime)
  console.log("⚠️ No se generó firebaseServiceAccount.json en build time");
  console.log("ℹ️ Los API routes intentarán cargar credenciales en runtime");
}

main().catch(err => {
  console.error("❌ Error en generate-firebase-creds.js:", err.message);
  process.exit(1);
});
  }
} catch (err) {
  console.error("❌ Error generando credenciales:", err.message);
  process.exit(1);
}
