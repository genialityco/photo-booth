# Configuración de Variables de Entorno

## 📍 Desarrollo Local (`.env.local`)

Este archivo **NO se envía a git** y contiene credenciales sensibles.

Las credenciales de Firebase se dividen en **variables pequeñas** para evitar los límites de Netlify:

```bash
# Variables públicas (copiar desde .env)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...

# Credenciales de Firebase Admin (divididas para Netlify)
FIREBASE_PROJECT_ID=lenovo-experiences
FIREBASE_PRIVATE_KEY_ID=741182982eb2b0b14319c75f0d90660a2b5ba1a7
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@lenovo-experiences.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=108444509545001025687
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----\n"

# API Keys
OPENAI_API_KEY=sk-proj-...
```

---

## 🚀 Producción (Netlify)

**Ir a Site settings > Build & deploy > Environment variables**

### Variables a configurar:

```
FIREBASE_PROJECT_ID = lenovo-experiences
FIREBASE_PRIVATE_KEY_ID = 741182982eb2b0b14319c75f0d90660a2b5ba1a7
FIREBASE_CLIENT_EMAIL = firebase-adminsdk-fbsvc@lenovo-experiences.iam.gserviceaccount.com
FIREBASE_CLIENT_ID = 108444509545001025687
FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
OPENAI_API_KEY = sk-proj-...
```

**NOTA:** NO es necesario agregar `NEXT_PUBLIC_*` en Netlify (ya están en `.env` del repo)

### Tamaño total: ✅ ~1.5 KB (dentro del límite de Netlify)

---

## ⚙️ Cómo funciona

1. **Build time** (`generate-firebase-creds.js`):
   - Lee las variables `FIREBASE_*` divididas
   - Reconstruye el JSON completo
   - Guarda en `.next/firebaseServiceAccount.json`

2. **Runtime** (API routes):
   - Intenta leer el archivo
   - Si no existe, reconstruye desde variables de entorno
   - Si nada funciona, lanza error

---

## 📝 Extracting Variables from Service Account JSON

Si tienes un nuevo `service-account.json`, extrae así:

### PowerShell:
```powershell
$json = Get-Content "path/to/service-account.json" -Raw
$obj = $json | ConvertFrom-Json

Write-Host "FIREBASE_PROJECT_ID=$($obj.project_id)"
Write-Host "FIREBASE_PRIVATE_KEY_ID=$($obj.private_key_id)"
Write-Host "FIREBASE_CLIENT_EMAIL=$($obj.client_email)"
Write-Host "FIREBASE_CLIENT_ID=$($obj.client_id)"
Write-Host "FIREBASE_PRIVATE_KEY=$($obj.private_key)"
```

### Node.js:
```bash
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('service-account.json')); console.log('FIREBASE_PROJECT_ID='+j.project_id); console.log('FIREBASE_CLIENT_EMAIL='+j.client_email); console.log('FIREBASE_PRIVATE_KEY='+JSON.stringify(j.private_key));"
```

---

## ✅ Checklist Netlify

- [ ] Agregar `FIREBASE_PROJECT_ID`
- [ ] Agregar `FIREBASE_PRIVATE_KEY_ID`
- [ ] Agregar `FIREBASE_CLIENT_EMAIL`
- [ ] Agregar `FIREBASE_CLIENT_ID`
- [ ] Agregar `FIREBASE_PRIVATE_KEY` (con saltos de línea `\n`)
- [ ] Agregar `OPENAI_API_KEY`
- [ ] Redeploy del sitio
- [ ] Verificar logs de build: `✓ firebaseServiceAccount.json generado desde variables`

---

## 🔒 Seguridad

- `.env` → Públicamente visible en git ✅ (solo NEXT_PUBLIC_*)
- `.env.local` → Ignorado por `.gitignore` ✅ (credenciales locales)
- Netlify env vars → Encriptadas en Netlify ✅ (no visibles en código)
- Variables divididas → Más pequeñas que el límite de 4 KB ✅

