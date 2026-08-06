# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Magic Camera" (`package.json` name) — a Next.js 15 (App Router) photo booth application for branded events. Attendees take a photo, an AI (OpenAI or Gemini, depending on deployment target) transforms it into a themed portrait, and the result is shown on a screen/mosaic display and can be printed or shared via QR code. Firebase (Firestore + Storage) is the backing store; heavy image generation runs in Firebase Cloud Functions, not in Next.js API routes.

The app is deployed to **Netlify** (see `netlify.toml`), while the background image-processing pipeline is deployed separately to **Firebase Cloud Functions** (see `functions/`). These are two independently deployed codebases sharing one Firestore project.

## Commands

Run from the repo root (Next.js app):
```bash
npm run dev          # start dev server (next dev)
npm run build         # generates firebaseServiceAccount.json then `next build`
npm run start          # next start (production server)
npm run lint            # next lint
```

Firebase Cloud Functions live in `functions/` and are a **separate npm project**:
```bash
cd functions
npm run build           # tsc, then copies src/assets/** into lib/assets
npm run build:watch     # tsc --watch
npm run serve            # build + firebase emulators:start --only functions
npm run shell            # build + firebase functions:shell (interactive invocation)
npm run deploy            # firebase deploy --only functions
npm run logs              # firebase functions:log
```
There is no test suite in this repo (no test runner configured).

## Environment & credentials

Firebase Admin credentials are intentionally split across many small env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_PRIVATE_KEY`) instead of one JSON blob, to stay under Netlify's 4KB env var limit. `generate-firebase-creds.js` runs as a `prebuild` step and reassembles them into `.next/firebaseServiceAccount.json` at build time. `src/server/firebaseAdmin.ts` and each server-side route that needs Admin SDK access (`src/app/api/storage/upload/route.ts`, etc.) independently try, in order: a local `firebaseServiceAccount.json` file, Google Secret Manager (`secretPhotobooth`), the split `FIREBASE_*` env vars, then a base64/JSON `FIREBASE_SERVICE_ACCOUNT` env var. See `README.env.md` and `FIREBASE_NETLIFY_SETUP.md` for the full rationale and setup checklist — read those before touching credential-loading code.

Client-side Firebase (`src/firebaseConfig.ts`) uses the `NEXT_PUBLIC_FIREBASE_*` vars and is safe to bundle publicly. Server-only secrets (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `FIREBASE_PRIVATE_KEY`, etc.) must never be imported into client components.

## Architecture

### Route groups (`src/app`)
- `(public)` — attendee/public-facing screens: `booth/[slug]` (capture flow), `display/[slug]` (event display screen), `mosaic/[slug]` (standalone Three.js photo mosaic wall), `print`, `printJobs`, `survey`, `home`.
- `(admin)/admin` — event/brand/style management console (`events`, `events/[id]/screen`, `brand`, `style`, `imageview`), wrapped by a shared `Sidebar` in `(admin)/admin/layout.tsx`.
- `api/` — Next.js server routes: `generate` (direct OpenAI call, legacy path), `storage/upload` & `storage/download` (Firebase Storage via Admin SDK), `qr` (in-memory QR token store, see caveat below), `events/[id]/images`, `photos`.

### The image-generation pipeline (the core flow)

This is the most important thing to understand before touching capture/result code:

1. Client captures a photo (`CaptureStep.tsx` + `captureWithFrame.ts` / `captureRawSquare.ts`) inside `PhotoBoothWizard.tsx`, which drives the wizard's `capture → preview → loading → result` states.
2. On confirm, the client uploads the framed photo as a data URL to `POST /api/storage/upload` (Next.js route, Firebase Admin SDK), which returns a public Storage download URL + path.
3. The client then writes a document directly to the `imageTasks` Firestore collection (`status: "queued"`, `inputPath`, `eventId`, `brand`, `color`, ...) — it does **not** call a Cloud Function HTTP endpoint for this path.
4. A Firestore-triggered Cloud Function, `processImageTask` (`onDocumentCreated` on `imageTasks/{taskId}` in `functions/src/index.ts`), picks up the doc, resolves the event's brand prompt from `photo_booth_prompts`, calls the Gemini API (`gemini-2.5-flash-image`) with the input image (+ optional logo / background / object composition images pulled from that brand config), saves the output PNG to Storage, and updates the doc to `status: "done"` with a `url`. If the event's `generationType` is `BGVIDEO`, it additionally posts to an external compositing service (`https://videobg.geniality.com.co/composite-video`) and stores a `videoUrl`.
5. The client (`PhotoBoothWizard.tsx`) is subscribed to that same Firestore doc via `onSnapshot` and flips to the `result` step once `status === "done"`.
6. `display/[slug]` and `mosaic/[slug]` independently subscribe to `imageTasks` (filtered by `eventId`, `status == "done"`) to drive the live event screen and the Three.js photo-mosaic wall (`MosaicCanvas.tsx`).

There is also a legacy/simpler path (`src/app/api/generate/route.ts` + `processGoatShotHttp` in `functions/src/index.ts`) that calls OpenAI's `images/edits` endpoint directly and returns synchronously instead of going through the `imageTasks` async pipeline. Prefer the Firestore/Gemini path described above for new work unless you have a specific reason to use the synchronous OpenAI path.

### Branding / prompts model

Per-brand AI prompt configuration lives in the `photo_booth_prompts` Firestore collection (managed via `src/app/services/photo-booth/brandService.ts` and the admin `brand` page). Each doc has a `basePrompt`, optional `colorDirectiveTemplate` (color gets substituted in via `${color}`/`{color}`), optional `logoPath`/`logoPrompt`, and optional `promptBgImage`/`objectImage`/`objectImagePrompt` for compositing extra reference images into the Gemini call. `getBrandedPromptCached`/`buildPromptWithBrand` in `functions/src/index.ts` load and cache these (60s in-memory cache) and fall back to a hardcoded `DEFAULT_PROMPT` when no active brand doc is found. Events (`events` collection, `src/app/services/photo-booth/eventService.ts`) reference a brand via `prompts: string[]` and carry their own display/layout config (`bgImage`, `logoTop/Bottom`, `frameImage`, `screenConfig` for the mosaic/display screen behavior, `generationType: "IMAGE" | "BGVIDEO" | "VIDEO"`).

### Known duplication — don't extend the legacy copies

- `src/app/services/eventService.ts` (root) is a superseded duplicate of `src/app/services/photo-booth/eventService.ts`; only the `photo-booth/` version is imported by any live route. Same for `src/app/home/components/public/*` vs. the live `src/app/components/photo-booth/*` (`EventsLanding`, `EventPhotoBoothLanding`) — the `home/` copies are unused dead code. When adding features to the landing/event flow, edit `src/app/components/photo-booth/*` and `src/app/services/photo-booth/eventService.ts`, not their `home`/root counterparts.
- The `services/` barrel (`src/app/services/index.ts`) only re-exports the `photo-booth/*` and `admin/styleService` modules — the legacy root `eventService.ts` is intentionally not exported from it.
- There is a legacy "style" model (`src/app/services/admin/styleService.ts`, admin `style` page, `StyleProfile` type) that predates the current per-`event` (`EventProfile`) config model. `PhotoBoothWizard.tsx` still supports loading either an `eventData` prop or a `styleId` query param and normalizes both into the same rendering shape — read that component's `loadStyle` effect before assuming which model is authoritative for a given route.

### `@/*` import alias

`tsconfig.json` maps `@/*` → `./src/*`. Use this alias (as the codebase does) rather than relative `../../` imports for anything outside the current directory.

### `functions/` is a separate TypeScript project

It has its own `tsconfig.json`, `package.json`, and dependency tree (`firebase-admin`, `@google/genai`, `sharp`, `fluent-ffmpeg`), and is excluded from the root `tsconfig.json` (`"exclude": ["functions/**"]`). Do not assume root-level type-checking or linting covers it — build/lint it from inside `functions/`.

### Firebase project

Default Firebase project alias is `lenovo-experiences` (`.firebaserc`), and `firebase.json` only declares the `functions` codebase (no hosting/firestore rules deploy config here) with lint+build as `predeploy` steps.

### Other notes

- The `qr` API route (`src/app/api/qr/route.ts`, `_store.ts`) keeps generated QR payloads in an in-process `Map` on `globalThis` with a 30-minute TTL — this does **not** survive across serverless instances/cold starts on Netlify, so don't rely on it for durability.
- Several server routes (`storage/upload`, `functions/src/index.ts`) contain multiple fallback strategies for locating credentials/config (file → Secret Manager → env vars → base64 env var). When debugging "credentials not found" issues, check all of these in order rather than assuming a single source of truth.
