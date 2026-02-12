#!/usr/bin/env node
/**
 * Script para verificar que las credenciales de Firebase existen
 * Se ejecuta después del build
 */

const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "firebaseServiceAccount.json");

console.log("\n=== Verificando Credenciales de Firebase ===\n");

if (!fs.existsSync(filePath)) {
  console.error("❌ ERROR: firebaseServiceAccount.json NO EXISTE");
  console.error(`   Ruta esperada: ${filePath}`);
  console.error("   Solución:");
  console.error("   1. Ejecuta: node generate-firebase-creds.js");
  console.error("   2. Verifica que FIREBASE_SERVICE_ACCOUNT esté en .env");
  process.exit(1);
}

try {
  const content = fs.readFileSync(filePath, "utf-8");
  const creds = JSON.parse(content);
  
  if (creds.project_id && creds.private_key && creds.client_email) {
    console.log("✓ firebaseServiceAccount.json existe y es válido");
    console.log(`✓ Proyecto: ${creds.project_id}`);
    console.log(`✓ Email: ${creds.client_email}`);
    console.log("\n✓ Credenciales verificadas correctamente\n");
  } else {
    console.error("❌ ERROR: Archivo inválido - faltan campos requeridos");
    console.error("   Campos encontrados:", Object.keys(creds));
    process.exit(1);
  }
} catch (err) {
  console.error("❌ ERROR: No se pudo leer/validar firebaseServiceAccount.json");
  console.error(`   Error: ${err.message}`);
  process.exit(1);
}
