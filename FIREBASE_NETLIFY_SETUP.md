# Configuración de Firebase en Netlify

## Problema 
En Netlify, las variables de entorno no deben exceder 4KB (límite de AWS Lambda). Por eso usamos un sistema de archivo + variable de entorno.

## Solución

### 1. Generar archivo local (Desarrollo)
El archivo `firebaseServiceAccount.json` ya está creado localmente. **NO** commitearlo a Git (está en .gitignore).

### 2. Configurar en Netlify

**Opción A: Automático (Recomendado)**

1. Ve a [Netlify Dashboard](https://app.netlify.com) → Tu sitio
2. **Settings** → **Build & Deploy** → **Environment**
3. Agrega una nueva variable:
   - **Key**: `FIREBASE_SERVICE_ACCOUNT`
   - **Value**: (Tu String Base64 codificado)

El script `generate-firebase-creds.js` se ejecutará automáticamente durante el build y creará el archivo.

**Opción B: Manual**

1. Si prefieres no usar variable de entorno, puedes subir el archivo directamente:
   - Descarga tu `firebaseServiceAccount.json`
   - Súbelo a través de Netlify File uploads (en Settings)
   - Verifica la ruta: `/firebaseServiceAccount.json`

## Verificación

Después de desplegar, busca en los logs de Netlify:
```
✓ firebaseServiceAccount.json generado exitosamente
✓ Firebase Admin SDK inicializado exitosamente
✓ Credenciales cargadas desde: /path/to/firebaseServiceAccount.json
```

## Variables de Entorno Necesarias

| Variable | Valor | Necesaria |
|----------|-------|-----------|
| `FIREBASE_SERVICE_ACCOUNT` | Base64 encoded JSON (opcional) | No* |
| `FIREBASE_STORAGE_BUCKET` | Tu bucket de Firebase | Sí |
| `OPENAI_API_KEY` | Tu API key de OpenAI | Sí |
| `NEXT_PUBLIC_*` | Credenciales públicas de Firebase | Sí |

*Solo si no subes el archivo manualmente

## Debugging

Si ves el error "Could not load the default credentials":

1. Verifica que `FIREBASE_SERVICE_ACCOUNT` esté configurada en Netlify
2. Revisa los logs del build:¿Se genera el archivo?
3. Asegúrate que el file Base64 sea válido: `node generate-firebase-creds.js`
4. Si nada funciona, sube `firebaseServiceAccount.json` manualmente
