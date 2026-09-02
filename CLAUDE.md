# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Magic Camera" (`package.json` name) — a Next.js 15 (App Router) photo booth application for branded events. Attendees take a photo, an AI (OpenAI or Gemini, depending on deployment target) transforms it into a themed portrait, and the result is shown on a screen/mosaic display and can be printed or shared via QR code. Firebase (Firestore + Storage) is the backing store; heavy image generation runs in Firebase Cloud Functions, not in Next.js API routes.

Three independently deployed pieces share one Firestore project:
- the Next.js app → **Netlify** (`netlify.toml`),
- the background image-processing pipeline → **Firebase Cloud Functions** (`functions/`),
- an optional Python service → **the on-site PC** (`kinect-roller-backend/`), only for events that reveal the photo with a real paint roller tracked by a Kinect v2.

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
Note `functions`' `lint` script is `echo "Skipping lint"` — the `predeploy` hooks in `firebase.json` run it, but it checks nothing. Only `tsc` (via `build`) actually gates a functions deploy.

`kinect-roller-backend/` is a **Python** project (Kinect v2 + OpenCV + WebSocket), run by hand on the PC driving the big screen — never deployed with the other two. See its own README for the full setup; the everyday commands are:
```bash
cd kinect-roller-backend
python -m venv .venv && .venv/Scripts/activate   # Windows-only project (pykinect2)
pip install -r requirements.txt
python patch_pykinect2.py    # re-run after every reinstall of pykinect2

python -m src.main --calibrate-bg   # calibrate the empty-screen depth background first
python -m src.main --debug           # run with the debug window
python -m src.main --mock --debug  # no Kinect: synthetic roller, for frontend work
```

There is no test suite in this repo (no test runner configured). To exercise the roller-reveal frontend against the Python backend without going through a whole booth session, use the harness route `/test/rodillo-reveal?src=<image-url>&ws=<ws-url>`.

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

1. Client captures a photo (`CaptureStep.tsx` + `captureWithFrame.ts` / `captureRawSquare.ts`) inside `PhotoBoothWizard.tsx`, which drives the wizard's `capture → preview → filter → customize → loading → reveal → result` states.
2. On confirm, the client uploads the framed photo as a data URL to `POST /api/storage/upload` (Next.js route, Firebase Admin SDK), which returns a public Storage download URL + path.
3. The client then writes a document directly to the `imageTasks` Firestore collection (`status: "queued"`, `inputPath`, `eventId`, `brand`, `color`, ...) — it does **not** call a Cloud Function HTTP endpoint for this path.
4. A Firestore-triggered Cloud Function, `processImageTask` (`onDocumentCreated` on `imageTasks/{taskId}` in `functions/src/index.ts`), picks up the doc, resolves the event's brand prompt from `photo_booth_prompts`, calls the Gemini API (`gemini-2.5-flash-image`, via a `GEMINI_API_KEY` Firebase secret) with the input image (+ optional logo / background / object composition images pulled from that brand config), saves the output PNG to Storage, and updates the doc to `status: "done"` with a `url`. If the event's `generationType` is `BGVIDEO`, it additionally posts to an external compositing service (`https://videobg.geniality.com.co/composite-video`) and stores a `videoUrl`.
5. The client (`PhotoBoothWizard.tsx`) is subscribed to that same Firestore doc via `onSnapshot`; once `status === "done"` it moves to the `reveal` step (an interactive `RevealStep`/`RollerRevealStep` animation, chosen by the event's `revealEffect`: `NONE | HAND_WIPE | ROLLER | ROLLER_COLOR | KINECT_ROLLER`) and then to `result` — unless `revealEffect` is `NONE`, which skips straight to `result`.
6. `display/[slug]` and `mosaic/[slug]` independently subscribe to `imageTasks` (filtered by `eventId`, `status == "done"`) to drive the live event screen and the Three.js photo-mosaic wall (`MosaicCanvas.tsx`).

There is also a legacy/simpler path (`src/app/api/generate/route.ts` + `processGoatShotHttp` in `functions/src/index.ts`) that calls OpenAI's `images/edits` endpoint directly and returns synchronously instead of going through the `imageTasks` async pipeline. Prefer the Firestore/Gemini path described above for new work unless you have a specific reason to use the synchronous OpenAI path.

### Two-screen sessions: leader vs. mirror

`booth/[slug]` is opened on **both** the attendee's tablet and (optionally) a big screen — the same URL, same component. `useBoothLiveSession` elects the first tab to claim the event as **leader** (Firestore transaction on `boothLiveSessions/{eventId}`, refreshed by a 5s heartbeat; 30s without one and the leader is considered gone). Every other tab becomes a **mirror** and renders `BoothMirror.tsx` instead of `PhotoBoothWizard.tsx`.

The leader broadcasts its wizard step and payload (`phase`, `taskId`, `brand`, `previewUrl`, `customization`, `showQr`) into that doc; the mirror only reflects it. The one field written *back* by the mirror is `revealedTaskId`: with `revealEffect: "KINECT_ROLLER"` — and with the default `HAND_WIPE` whenever `mirrorScreenEnabled !== false` — the reveal does not happen on the tablet at all. The tablet parks on a "revealing on the big screen" message and waits for the mirror to report that *this* `taskId` was revealed. Both branches keep an invisible rescue button (bottom-right of the reveal step) so an operator can force the step forward when the mirror never reports.

So: changing anything in the wizard's `reveal`/`result` steps usually means changing the matching view in `BoothMirror.tsx` too, and a "nothing happens after the photo generates" bug is more often a broken live session than a broken pipeline.

This is separate from `display/[slug]` and `mosaic/[slug]`, which are passive screens subscribed straight to `imageTasks` — they know nothing about live sessions.

### Firestore collections

`events` (event config, `eventService.ts`), `imageTasks` (one doc per photo: the async job *and* the archive of results), `photo_booth_prompts` (per-brand AI prompt config), `boothLiveSessions` (one doc per event, leader/mirror sync). Note `printJobsService.ts` reads `imageTasks` despite its name and `PrintJob` type — there is no separate print-jobs collection.

### How event config reaches components

Config crosses component boundaries through `sessionStorage`, not only through props — know which before assuming a value is available:
- `booth/[slug]` writes `currentEvent` (the raw `EventProfile`) on load; `PhotoBoothWizard` also writes `photoBoothStyle` (that event normalized into the legacy `StyleProfile` shape). `LoaderStep`, `ResultStep` and `SurveyClient` read those keys directly rather than receiving props.
- `selectedBrand` / `selectedColor` carry the attendee's choice from the landing screen into the wizard and the Cloud Function payload.
- Values read from `sessionStorage` can be **stale** (the event was edited in the admin after the tab was opened) and are **per-tab** (a mirror screen never has `selectedBrand`, since the choice happened on the tablet). Components that matter take an explicit prop override — e.g. `LoaderStep`'s `eventOverride`/`brandIdOverride` — and fall back to the cache.
- `/survey` (the page behind the download QR) is the exception that cannot use any of this: it is opened by scanning the QR on the attendee's **phone**, a different device entirely. Everything it needs travels in the URL that `ResultStep`/`BoothMirror` build — `src`, `kind`, `filename`, `frameUrl`, `eventId` — and it re-fetches the event from Firestore. Adding anything event-specific to that page means adding a query param on both builders.

### Low-bandwidth ("modo ahorro de datos") mode

Events are often held on bad venue wifi, and the booth's expensive downloads happen *during* a session, competing with the photo upload: the `ROLLER`/`ROLLER_COLOR` reveal prefetches `public/ort/*.wasm` (24 MB + 13 MB) and `public/models/rodillo-detector/best.onnx` (12 MB), and hand tracking pulls MediaPipe (`hand_landmarker.task` 7.8 MB + `vision_wasm_internal.wasm` 11.7 MB).

`components/photo-booth/lowBandwidthMode.ts` is the single place that decides what gets turned off. The mechanism to know: rather than threading a flag through a dozen components, `booth/[slug]` derives an `EventProfile` with `applyLowBandwidth(event, on)` and passes *that* down to everything (wizard, `BoothMirror`, `ScreenSaver`, `BackgroundAnimation`, `HandCursorOverlay`). Anything that already reads `event.revealEffect` / `event.handCursorEnabled` / `event.screenSaverVideoUrl` is covered for free — so new heavy features should be expressed as an `EventProfile` field and switched off there, not with a separate flag.

The mode is on when any of these say so, in priority order: `?lite=1` in the URL, the `sessionStorage` preference set by `DataSaverBadge` (the discreet dot at bottom-left, next to `LiveSessionStatusBadge`), or `event.lowBandwidthMode` from the admin. `applyLowBandwidth` keeps `lowBandwidthMode: true` on the derived event, which is how `PhotoBoothWizard` still knows to compress the capture (`captureQualityFor`/`previewUploadQualityFor`).

### Kiosk shell and shared sizing

`src/app/layout.tsx` locks the whole app to `h-dvh overflow-hidden` (it is a kiosk, not a scrolling site). A page taller than the viewport is silently cut off with no scrollbar — pages that can overflow (`/survey` on a phone) must scroll in their own `overflow-y-auto` container.

Event logo sizing lives in `components/photo-booth/logoBarSizing.ts` (base heights/widths + `scaledLogoStyle`/`scaledWideLogoStyle`, which apply the event's `logoTopScalePct`/`logoBottomScalePct`). Every booth screen that draws `logoTop`/`logoBottom` goes through it — hardcoding a Tailwind height class instead silently ignores the size the admin configured. `SplashScreen` is the deliberate exception: it has its own free-positioning layout editor (`SplashLayoutEditor.tsx`).

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

Default Firebase project alias is `lenovo-experiences` (`.firebaserc`), and `firebase.json` only declares the `functions` codebase (no hosting/firestore rules deploy config here) with lint+build as `predeploy` steps. Firestore security rules are **not** in this repo, so read/write permissions can only be checked in the Firebase console — worth remembering, since public pages (`booth`, `display`, `survey`) read `events`/`imageTasks` straight from the client with no auth.

### Other notes

- The `qr` API route (`src/app/api/qr/route.ts`, `_store.ts`) keeps generated QR payloads in an in-process `Map` on `globalThis` with a 30-minute TTL — this does **not** survive across serverless instances/cold starts on Netlify, so don't rely on it for durability.
- The Kinect roller reveal talks to the Python backend over a plain WebSocket, `NEXT_PUBLIC_KINECT_WS_URL` (default `ws://localhost:8765`, see `BoothMirror.tsx`). It must be `localhost`: an https page is blocked from opening `ws://` to any other LAN address (mixed content), so the Python service has to run on the very PC showing the big screen.
- Several server routes (`storage/upload`, `functions/src/index.ts`) contain multiple fallback strategies for locating credentials/config (file → Secret Manager → env vars → base64 env var). When debugging "credentials not found" issues, check all of these in order rather than assuming a single source of truth.
