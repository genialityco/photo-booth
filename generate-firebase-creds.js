#!/usr/bin/env node
/**
 * Script para generar firebaseServiceAccount.json desde variable de entorno
 * Se ejecuta solo si el archivo no existe y la variable de entorno está disponible
 */

const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "firebaseServiceAccount.json");

// Si el archivo ya existe localmente, no hacer nada
if (fs.existsSync(filePath)) {
  console.log("✓ firebaseServiceAccount.json ya existe");
  process.exit(0);
}

// Intentar crear desde variable de entorno (para Netlify)
const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!encoded) {
  console.warn("⚠️ No se puede generar credenciales: FIREBASE_SERVICE_ACCOUNT no definido");
  process.exit(0);
}

try {
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const credentials = JSON.parse(decoded);
  
  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf-8");
  console.log("✓ firebaseServiceAccount.json generado desde variable de entorno");
} catch (err) {
  console.error("❌ Error generando credenciales:", err.message);
  process.exit(1);
}
