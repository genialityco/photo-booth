#!/usr/bin/env node
/**
 * Script para generar firebaseServiceAccount.json desde variables de entorno divididas
 * Se ejecuta antes del build de Next.js
 */

const fs = require("fs");
const path = require("path");

// Ruta del archivo
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

async function main() {
  // Intentar reconstruir desde variables divididas (Netlify)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKeyId = process.env.FIREBASE_PRIVATE_KEY_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const clientId = process.env.FIREBASE_CLIENT_ID;

  if (projectId && privateKey && clientEmail) {
    try {
      // Reconstruir el objeto credential desde las variables
      const serviceAccount = {
        type: "service_account",
        project_id: projectId,
        private_key_id: privateKeyId,
        private_key: privateKey.replace(/\\n/g, '\n'), // Convertir \n de string de entorno a saltos reales
        client_email: clientEmail,
        client_id: clientId,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`,
        universe_domain: "googleapis.com"
      };

      // Validar que es JSON válido
      JSON.stringify(serviceAccount); // Esto lanzará error si no es serializable
      
      fs.writeFileSync(filePath, JSON.stringify(serviceAccount, null, 2), "utf-8");
      console.log("✓ firebaseServiceAccount.json generado desde variables de entorno divididas");
      
      // Validar el archivo
      const content = fs.readFileSync(filePath, "utf-8");
      JSON.parse(content);
      console.log("✓ Archivo validado correctamente");
      return;
    } catch (err) {
      console.warn("⚠️ Error con variables divididas:", err.message);
    }
  }

  // Fallback: intentar con FIREBASE_SERVICE_ACCOUNT (puede ser JSON directo o Base64)
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (encoded) {
    try {
      console.log("🔄 Intentando parsear FIREBASE_SERVICE_ACCOUNT como JSON directo...");
      
      // Primero intentar como JSON directo (una línea con \n escapados)
      try {
        const unescaped = encoded.replace(/\\n/g, '\n');
        const credentials = JSON.parse(unescaped);
        
        fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf-8");
        console.log("✓ firebaseServiceAccount.json generado desde FIREBASE_SERVICE_ACCOUNT (JSON directo)");
        
        const content = fs.readFileSync(filePath, "utf-8");
        JSON.parse(content);
        console.log("✓ Archivo validado correctamente");
        return;
      } catch (jsonErr) {
        console.log("⚠️ No es JSON directo, intentando como Base64...");
      }
      
      // Fallback: intentar decodificar como Base64
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const unescaped = decoded.replace(/\\n/g, '\n');
      const credentials = JSON.parse(unescaped);
      
      fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf-8");
      console.log("✓ firebaseServiceAccount.json generado desde FIREBASE_SERVICE_ACCOUNT (Base64)");
      
      const content = fs.readFileSync(filePath, "utf-8");
      JSON.parse(content);
      console.log("✓ Archivo validado correctamente");
      return;
    } catch (err) {
      console.warn("⚠️ Error con FIREBASE_SERVICE_ACCOUNT:", err.message);
    }
  }

  // Si nada funciona, continuar (los API routes lo manejarán en runtime)
  console.log("⚠️ No se generó firebaseServiceAccount.json en build time");
  console.log("ℹ️ Los API routes intentarán cargar credenciales en runtime");
}

main().catch(err => {
  console.error("❌ Error en generate-firebase-creds.js:", err.message);
  process.exit(1);
});
