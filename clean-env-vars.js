#!/usr/bin/env node
/**
 * Script para limpiar variables de entorno innecesarias antes del deploy
 * Ejecutarse DESPUES del build, antes de que Netlify intente deployar a Lambda
 */

// Obtén las variables a LIMPIAR (que no son necesarias en runtime)
const VARS_TO_REMOVE = [
  'FIREBASE_SERVICE_ACCOUNT', // Solo necesaria durante build
  'SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES', // Solo para scanning
];

// Nota: Netlify no proporciona una forma built-in de remover variables
// Pero este script puede servir como documentación o integrarse con un plugin

console.log('📝 Variables que deben removerse en Netlify para cumplir límite de 4KB:');
VARS_TO_REMOVE.forEach(v => console.log(`  - ${v}`));

console.log('\n💡 Para implementar esto en Netlify:');
console.log('1. Ve a Site settings > Environment > Variables');
console.log('2. REVIEW cada variable - algunas pueden ser removidas:');
console.log('   - FIREBASE_SERVICE_ACCOUNT: NO es necesaria en runtime');
console.log('   - SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES: Solo para escaneo');
console.log('3. Mantén SOLO las variables públicas (NEXT_PUBLIC_*) y API keys necesarias');
console.log('4. Mantén las variables necesarias para APIs (OPENAI_API_KEY)');
