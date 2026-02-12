#!/usr/bin/env node
/**
 * Script para generar firebaseServiceAccount.json desde variable de entorno
 * Se ejecuta antes del build de Next.js
 */

const fs = require("fs");
const path = require("path");

// Ruta absoluta del archivo
const rootDir = __dirname;
const filePath = path.join(rootDir, "firebaseServiceAccount.json");

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

// Obtener credenciales de variable de entorno (Netlify)
const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!encoded) {
  // En desarrollo, intentar leer del .env o crear archivo vacío
  console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT no definido en variables de entorno");
  process.exit(0);
}

try {
  // Decodificar Base64
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const credentials = JSON.parse(decoded);
  
  // Escribir el archivo
  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf-8");
  console.log("✓ firebaseServiceAccount.json generado exitosamente");
  
  // Verificar que se escribió correctamente
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    JSON.parse(content); // Validar que es JSON válido
    console.log("✓ Archivo validado correctamente");
  } else {
    console.error("❌ Error: No se pudo crear el archivo");
    process.exit(1);
  }
} catch (err) {
  console.error("❌ Error generando credenciales:", err.message);
  process.exit(1);
}
