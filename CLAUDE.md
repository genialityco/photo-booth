# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An AI photo-booth ("magic-camera") for live events. Guests take a selfie at a booth, and an AI model transforms it into a themed portrait (e.g. a World Cup soccer player) branded for the event's sponsor. Results are delivered on-device and via QR code, and can be aggregated onto a live mosaic/display screen. UI text and code comments are predominantly in Spanish.

## Commands

Next.js app (repo root):

```bash
npm run dev      # local dev server on http://localhost:3000
npm run build    # runs generate-firebase-creds.js, then next build
npm run lint     # eslint (next lint)
```

Firebase Functions (in `functions/`, deployed separately from the web app):

```bash
cd functions
npm run build    # tsc + copies src/assets -> lib/assets (required before deploy)
npm run deploy   # firebase deploy --only functions
npm run logs     # firebase functions:log
npm run serve    # build + firebase emulators:start --only functions
```

There is no test suite. `@/*` is aliased to `./src/*` (tsconfig). `functions/**` is excluded from the root TS project — Functions have their own `tsconfig` and `node_modules` and must be built/linted from inside `functions/`.

## Architecture

Two independently deployed halves that communicate **only through Firestore and Cloud Storage** — there is no direct API call between them.

### 1. Next.js app (App Router, `src/app`)

Route groups:
- `(public)` — guest-facing: `booth/[slug]` (the booth wizard), `display/[slug]` and `mosaic/[slug]` (live event screens that subscribe to Firestore in real time), plus `home`, `survey`, `print`.
- `(admin)` — `admin/` CRUD dashboards for events, styles, brand prompts, and image viewing.
- `api/` — Next.js route handlers (`runtime = "nodejs"`), notably `storage/upload` and `storage/download` (server-side Storage access via Admin SDK), `generate` (a **legacy/alternate** synchronous OpenAI path — the live booth does NOT use this; see below), `qr`, `photos`.

Firebase is accessed two ways, kept strictly separate:
- **Client SDK** — [src/firebaseConfig.ts](src/firebaseConfig.ts). Exports `db` (Firestore, isomorphic). Auth/Storage/Messaging are lazy browser-only helpers guarded by `isBrowser()`; never import them into server code.
- **Admin SDK** — [src/server/firebaseAdmin.ts](src/server/firebaseAdmin.ts) and the credential loader inside [src/app/api/storage/upload/route.ts](src/app/api/storage/upload/route.ts). Used only inside `api/` routes.

Data access is centralized in [src/app/services](src/app/services) (barrel at `services/index.ts`). Each service wraps one Firestore collection:
- `events` — `EventProfile` (event branding, backgrounds, logos, frame, `generationType`, `screenConfig` for the mosaic, and a list of `prompts` = brand IDs). Looked up by `slug`.
- `photo_booth_prompts` — brand prompt configs (`basePrompt`, `logoPath`, `colorDirectiveTemplate`, `videoUrl`, background/object images). Queried by the `brand` field, not the doc ID.
- `style_profiles` — older per-screen styling model; an `EventProfile` is converted to a `StyleProfile` on the fly in the wizard.
- `surveys` — survey submissions.

### 2. Firebase Functions (`functions/src/index.ts`)

The generation engine. Key trigger: **`processImageTask`** — fires `onDocumentCreated` for `imageTasks/{taskId}`.

The booth's real flow is entirely event-driven ([PhotoBoothWizard.tsx](src/app/components/photo-booth/PhotoBoothWizard.tsx) `confirmAndProcess`):
1. Client uploads the framed selfie via `POST /api/storage/upload` → `tasks/{taskId}/input.png`.
2. Client writes an `imageTasks/{taskId}` doc (`status: "queued"`, plus `inputPath`, `brand`, `color`, `eventId`).
3. `processImageTask` picks up the new doc, resolves the branded prompt (`buildPromptWithBrand`, 60s in-memory cache), assembles a multi-image Gemini request (`gemini-2.5-flash-image`) combining the selfie + optional logo, object, and background images, saves the result to `tasks/{taskId}/output.png`, and updates the doc to `status: "done"` with a tokenized download `url`.
4. If the event's `generationType === "BGVIDEO"`, it additionally POSTs to the external `videobg.geniality.com.co/composite-video` service and stores `videoUrl`.
5. The client holds an `onSnapshot` on the task doc the whole time and advances the wizard when `status` becomes `done`/`error`.

Other functions: `processGoatShotHttp` (an HTTP-endpoint variant that uses **OpenAI `gpt-image-1`** instead of Gemini), `uploadEventImage`, `getCacheStats`. Note the two generation paths use different models — `processImageTask`/Gemini is the current booth path; the OpenAI code (both here and in `api/generate/route.ts`) is legacy/alternate.

The booth wizard is a 4-step client state machine: `capture → preview → loading → result` (see `step` in `PhotoBoothWizard`). `brand`/`color` selection is passed via `sessionStorage` and/or query params.

## Configuration & secrets

- **Web app** reads Firebase public config from `NEXT_PUBLIC_FIREBASE_*` and Admin credentials from split `FIREBASE_*` vars (or a `firebaseServiceAccount.json` file, or GCP Secret Manager `secretPhotobooth`). `OPENAI_API_KEY` is used by the legacy `api/generate` path. See [README.env.md](README.env.md) and [FIREBASE_NETLIFY_SETUP.md](FIREBASE_NETLIFY_SETUP.md).
- **Functions** read `OPENAI_API_KEY` and `GEMINI_API_KEY` via `defineSecret` (Firebase Secret Manager), not env files.
- Deploy target is **Netlify** ([netlify.toml](netlify.toml), `@netlify/plugin-nextjs`). Env vars are split into small pieces to stay under Netlify's 4KB limit; `generate-firebase-creds.js` runs at build time to reconstruct `firebaseServiceAccount.json` from those pieces. Secrets scanning is disabled in `netlify.toml`.
- The Firebase project is `lenovo-experiences`. `.env`, `.env.local`, `.env.new` exist locally and are gitignored (except `.env` which holds only `NEXT_PUBLIC_*`).
