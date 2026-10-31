# Team Coach

Esports team/org management platform — see the phase plan below for scope.
Everything currently runs locally for testing. No CI/CD yet; that comes once
you're ready to move beyond your laptop.

## Project layout

```
team-coach/
  backend/   NestJS API (TypeScript, Prisma, PostgreSQL) — shared by mobile + web
  mobile/    React Native app (Expo, Android-first)
  web/       React website (Vite + TypeScript) — same API as mobile
  docker-compose.yml   local Postgres (compose plugin not installed here — see below)
```

## One-time setup

### 1. Postgres

`docker compose` (the plugin) isn't installed on this machine, so for now start
Postgres directly:

```bash
docker run -d --name team-coach-postgres \
  -e POSTGRES_USER=team_coach \
  -e POSTGRES_PASSWORD=team_coach_local_pw \
  -e POSTGRES_DB=team_coach \
  -p 5432:5432 \
  -v team_coach_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

(Once you install the compose plugin — `sudo apt install docker-compose-plugin`
— you can just run `docker compose up -d` from this folder instead, using the
`docker-compose.yml` already here.)

Stop/start it later with `docker stop team-coach-postgres` / `docker start team-coach-postgres`.

### 2. Backend

```bash
cd backend
npm install
npm run prisma:migrate:dev   # applies the schema to your local Postgres
```

### 3. Mobile (Expo)

```bash
cd mobile
npm install
```

### 4. Web (Vite React)

```bash
cd web
npm install
```

## Start

Each start script loads one env file. Fill that file before you run the matching command. Local development files already have working defaults; stage and production are placeholders.

### Laptop Chrome (see the UI)

Use this when you want the app in Chrome on this laptop. Android emulator address `10.0.2.2` does not work in the browser, so `npm run web` points the API at `http://localhost:3000`. It also runs on port 8090 instead of Expo's default 8081, since another local project on this machine already uses 8081.

Terminal 1, backend:

```bash
cd backend
npm run start:dev
```

Loads `backend/.env.development` (`NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `CORS_ORIGIN`). API is at http://localhost:3000.

Terminal 2, app in Chrome:

```bash
cd mobile
npm run web
```

Chrome opens http://localhost:8090. The script loads `mobile/.env.development`, then overrides `API_BASE_URL`.

### Desktop website (Vite)

Same backend. From another terminal:

```bash
cd web
npm run dev
```

Opens http://localhost:5173 (`VITE_API_BASE_URL=http://localhost:3000`).

```
APP_ENV=development
API_BASE_URL="http://localhost:3000"
GOOGLE_WEB_CLIENT_ID=""
GOOGLE_ANDROID_CLIENT_ID=""
GOOGLE_IOS_CLIENT_ID=""
```

`GOOGLE_*` values still come from `mobile/.env.development`. Only `API_BASE_URL` changes for Chrome.

### Backend

| Command | Env file | What it does |
|---|---|---|
| `npm run start:dev` | `.env.development` | Dev server on http://localhost:3000, reloads on change |
| `npm run start:debug` | `.env.development` | Same, with the Node inspector attached |
| `npm run build && npm run start:stage` | `.env.stage` | Compiled server, staging env |
| `npm run build && npm run start:prod` | `.env.production` | Compiled server, production env |

Run from `backend/`:

```bash
npm run start:dev
```

`.env.development`

```
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://team_coach:team_coach_local_pw@localhost:5432/team_coach?schema=public"
JWT_SECRET=""
JWT_EXPIRES_IN="7d"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
CORS_ORIGIN="*"
```

`.env.stage`

```
NODE_ENV=stage
PORT=3000
DATABASE_URL="postgresql://USER:PASSWORD@STAGE_DB_HOST:5432/team_coach?schema=public"
JWT_SECRET=""
JWT_EXPIRES_IN="7d"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="https://staging.example.com/auth/google/callback"
CORS_ORIGIN="https://staging.example.com"
```

`.env.production`

```
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://USER:PASSWORD@PROD_DB_HOST:5432/team_coach?schema=public"
JWT_SECRET=""
JWT_EXPIRES_IN="30d"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="https://app.example.com/auth/google/callback"
CORS_ORIGIN="https://app.example.com"
```

| Key | Used for |
|---|---|
| `NODE_ENV` | Which env file Nest loads (`development`, `stage`, `production`) |
| `PORT` | HTTP port (default `3000`) |
| `DATABASE_URL` | Postgres connection string (Prisma) |
| `JWT_SECRET` | Signs and verifies login tokens. Required. |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `GOOGLE_CLIENT_ID` | Web OAuth client used to verify Google sign-in |
| `GOOGLE_CLIENT_SECRET` | Same Web OAuth client |
| `GOOGLE_CALLBACK_URL` | Redirect URI registered on that client |
| `CORS_ORIGIN` | Allowed browser origin. `*` for local dev |

### Mobile

`APP_ENV` picks the file: `development` (default), `stage`, or `production`.

| Command | Env file | What it does |
|---|---|---|
| `npm start` | `.env.development` | Expo dev server. Scan the QR in Expo Go, or press `a` for an Android emulator |
| `npm run android` | `.env.development` | Same, opens the Android emulator |
| `npm run ios` | `.env.development` | Same, opens the iOS simulator |
| `npm run web` | `.env.development`, with `API_BASE_URL=http://localhost:3000` | Opens the UI in Chrome at http://localhost:8090 |
| `npm run start:stage` | `.env.stage` | Expo against the staging API |
| `npm run start:prod` | `.env.production` | Expo against the production API |

Run from `mobile/`:

```bash
npm start
```

`.env.development`

```
API_BASE_URL="http://10.0.2.2:3000"
GOOGLE_WEB_CLIENT_ID=""
GOOGLE_ANDROID_CLIENT_ID=""
GOOGLE_IOS_CLIENT_ID=""
```

`http://10.0.2.2:3000` is what an **Android emulator** uses to reach your laptop's `localhost`. On a **physical phone** via Expo Go, set `API_BASE_URL` to your laptop's LAN IP (find it with `hostname -I`), for example `http://192.168.1.23:3000`. The phone cannot resolve `localhost` as your laptop.

`.env.stage`

```
API_BASE_URL="https://staging.example.com"
GOOGLE_WEB_CLIENT_ID=""
GOOGLE_ANDROID_CLIENT_ID=""
GOOGLE_IOS_CLIENT_ID=""
```

`.env.production`

```
API_BASE_URL="https://app.example.com"
GOOGLE_WEB_CLIENT_ID=""
GOOGLE_ANDROID_CLIENT_ID=""
GOOGLE_IOS_CLIENT_ID=""
```

| Key | Used for |
|---|---|
| `API_BASE_URL` | Backend the app calls |
| `GOOGLE_WEB_CLIENT_ID` | Web OAuth client. Must match backend `GOOGLE_CLIENT_ID` |
| `GOOGLE_ANDROID_CLIENT_ID` | Android OAuth client |
| `GOOGLE_IOS_CLIENT_ID` | iOS OAuth client |

## Secrets you need to fill in

Everything else is already set up with working local defaults. These are the
only values you need to get from an external source and paste into the env
files:

| Where | Key | How to get it |
|---|---|---|
| `backend/.env.development` | `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → create an OAuth 2.0 **Web application** client. This is the one whose ID is used to verify Google sign-in server-side. |
| `backend/.env.development` | `GOOGLE_CLIENT_SECRET` | Same client as above. |
| `mobile/.env.development` | `GOOGLE_WEB_CLIENT_ID` | **Must be the same ID** as `backend`'s `GOOGLE_CLIENT_ID` above. |
| `mobile/.env.development` | `GOOGLE_ANDROID_CLIENT_ID` | Same Google Cloud project → create an **Android** OAuth client (package name `com.teamcoach.app`, from `mobile/app.config.ts`; SHA-1 from your debug keystore: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`). |
| `backend/.env.development` | `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Only if you set `VOICE_SELF_HOSTED=false`. Free project at [cloud.livekit.io](https://cloud.livekit.io), keys under Settings → Keys (Phase 1G hosted voice). |
| `backend/.env.development` | `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) — powers AI stat extraction from scrim/tournament screenshots (Phase 1F). Without it, the feature returns a clear error instead of crashing. |

Until these are filled in, email/password signup and login work fully — only
the "Continue with Google" button is inert (it shows an alert telling you it's
not configured yet instead of crashing).

`JWT_SECRET` for development is already generated and set. When you move to
stage/production, generate your own with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Testing

### Backend — automated e2e + unit tests

```bash
cd backend
npm run test:e2e   # full suite against a dedicated test database, ~133 tests
npm run test       # unit tests (currently just the hosted-voice branch)
```

Tests run against `team_coach_test`, a separate Postgres database from the one you use for manual testing — they never touch your dev data. First-time setup: `createdb team_coach_test` (or `docker exec team-coach-postgres psql -U team_coach -d team_coach -c "CREATE DATABASE team_coach_test;"` if you don't have `psql` locally), then `npm run prisma:migrate:deploy:test`.

Coverage: one `.e2e-spec.ts` file per phase (1A–1G) in `backend/test/`, covering the full HTTP + WebSocket + database flow for real — not mocked. Every phase's suite also probes the kind of thing a real attacker or a real bug would hit: cross-org data leakage, mass-assignment (sending fields a client shouldn't control), ownership checks on edit/delete, and auth rejection paths. Shared helpers live in `backend/test/utils/` (`test-app.ts` for bootstrapping, `fixtures.ts` for signup/org/media helpers, `socket-helpers.ts` for WebSocket assertions).

Three real bugs were found and fixed by writing these tests, not just confirmed by them — worth knowing about since they're the kind of thing that could resurface if this code is refactored carelessly:
- `POST /auth/google` returned a raw `500` for any failed token verification (malformed input or even a network hiccup) instead of a clean `401` — see `src/auth/auth.service.ts`.
- `ChatGateway` and `VoiceGateway` both had a real race condition: auth/setup ran in `handleConnection`, which fires *after* the client already sees itself as connected — a message sent immediately after connecting could be silently dropped. Fixed by moving auth into Socket.IO handshake middleware (`afterInit` + `server.use()`) in both gateways, so a socket is either fully set up or never considered connected at all.
- Three dependencies (`nanoid`, `@nestjs/mapped-types`, `expo-server-sdk`) resolved to ESM-only versions that broke Jest despite working in the live dev server. Pinned the first two to CJS-compatible versions; replaced `expo-server-sdk` with a direct HTTP call to Expo's push API (`src/common/push-notification.service.ts`) since that one had no CJS build at all.

One finding flagged but intentionally left as-is (a design tradeoff, not a bug): joining an org only needs the shared code, and the joiner self-declares PLAYER or COACH with no separate coach-only invite — see the Phase 1A section below for the tradeoff.

### Mobile — component + logic tests

```bash
cd mobile
npm test
```

Uses `jest-expo` + `@testing-library/react-native`. No device or emulator needed — these are fast, pure-JS tests, separate from the manual device/browser verification described in each phase's section below. `jest.setup.ts` globally mocks every native module that can't run outside a compiled app (`@livekit/react-native-webrtc`, `mediasoup-client`, `livekit-client`, `socket.io-client`) plus AsyncStorage (via its official in-memory test mock) — several screens pull these in transitively through navigation, so without mocking them even unrelated component tests would crash at import time, the same way the real native module throws when it's missing (which is also why `VoiceChannelScreen.web.tsx` exists — see Phase 1G).

Current coverage: `AuthContext` (session restore on launch, login/signup/logout, token persistence, an invalid stored token being cleared instead of leaving the app stuck) and `RoleChips` (the multi-select role picker shared between the profile editor and the read-only member view). More to add as needed — ask for a specific screen or flow.

## Phase plan

| Phase | Scope |
|---|---|
| **0** (done) | Repo scaffold, Postgres, env files |
| **1A** (done) | Signup/login + Google OAuth, create/join org (code + referral link), 1 roster/org = max 5 players + unlimited coaches |
| **1B** (done) | Player profile: multi-select roles, social links (WhatsApp/Insta/Discord/YouTube), IGN+UID with copy icon, device name/model (multiple), org member directory |
| **1C** (done) | Media upload (image/video) + push notification to coach on every upload + coach media dashboard |
| **1D** (done) | Org text chat (group chat, WebSocket) |
| **1E** (done) | Manual scrim/tournament registration, org-only visibility, list/calendar |
| **1F** (done — see caveat below) | AI stat extraction from screenshots (AI-suggests → human confirms in v1), per-player stats dashboard |
| **1G** (done — backend tested, mobile untested, see caveat) | Voice channels — self-hosted signaling + mediasoup SFU, or hosted LiveKit, toggled by `VOICE_SELF_HOSTED` |

Android-only for now — the iOS phase is dropped from the plan. The codebase isn't Android-locked (`ios` config still exists in `mobile/app.config.ts` and nothing Android-specific was hardcoded), so iOS stays possible to pick up later if that changes, it's just not being planned or built toward right now.

### Phase 1A — what's implemented

Backend (`backend/src`):
- `auth/` — `POST /auth/signup`, `POST /auth/login`, `POST /auth/google`, `GET /auth/me` (JWT-protected)
- `org/` — `POST /orgs` (create), `POST /orgs/join` (by org code or referral token), `GET /orgs/me` (roster)
- One org = one roster: max 5 `PLAYER` memberships enforced atomically in a transaction, unlimited `COACH` memberships, a user can belong to only one org at a time
- Verified manually end-to-end: signup → create org → 5 players join → 6th player rejected (409) → extra coach joins fine → login → `/auth/me` → `/orgs/me` roster → unauthenticated request rejected (401)

Mobile (`mobile/src`):
- Screens: Login, Signup, Org choice, Create Org, Join Org, Org Home (roster list)
- Auth state persisted via `AsyncStorage`, automatic routing between Auth → Org setup → Org home stacks based on whether you're logged in / have an org
- Google sign-in button wired via `expo-auth-session`, waiting on the client IDs above

### Phase 1B — what's implemented

Backend (`backend/src/users`):
- `GET /users/me` / `PATCH /users/me` — own profile: roles (multi-select from a fixed list in `dto/update-profile.dto.ts`), in-game name, in-game UID, WhatsApp/Instagram/Discord/YouTube URLs
- `GET/POST /users/me/devices`, `DELETE /users/me/devices/:id` — a player can register multiple devices (name + model)
- `GET /users/:id/profile` — view another member's full profile, gated to users who share an org (coach ↔ player, player ↔ player); returns 403 otherwise
- Verified end-to-end: profile update, invalid role rejected (400), device add/remove, same-org profile view (both directions), cross-org view correctly rejected (403)

Mobile (`mobile/src/screens/profile`):
- `ProfileScreen` — edit own roles (tappable chips), IGN/UID (with copy buttons), social links, and device list (add/remove)
- `MemberProfileScreen` — read-only view of another org member, reached by tapping them in the Org Home roster; IGN/UID shown with a "Copy" button that flashes "Copied"
- Verified visually in the browser (`npm run web`) end-to-end: login → edit profile → roles/IGN/UID/Discord link save and persist → tap a teammate → see their profile → copy-to-clipboard feedback confirmed
- Role list lives in `mobile/src/api/roles.ts`, kept in sync with the backend's list by hand (not yet a shared package — fine at this scale, worth revisiting if the list grows)

### Phase 1C — what's implemented

Backend (`backend/src/media`):
- `POST /media` (multipart upload) — stores the file to disk under `backend/uploads/` (path from `MEDIA_UPLOAD_DIR`) with a random 32-char filename, creates a `MediaPost` row scoped to the uploader's org, and fires a best-effort push notification to every coach in that org (never blocks the upload response — verified the request still returns in ~40ms even when a push send fails)
- `GET /media?uploaderId=` — org-scoped feed, optionally filtered to one player; a user with no org gets a clean 404, not someone else's org's media
- Uploaded files are served statically at `/media-files/<key>` with **no auth check on the file bytes themselves** — access control is "unguessable random filename" rather than a real permission check. The metadata API (`GET /media`) is still JWT + org-gated. This is a deliberate shortcut for a small trusted group testing locally (see the comment in `main.ts`) — revisit with signed/expiring URLs before this is ever reachable by the public internet.
- Non-image/video uploads are rejected (400); verified with a `.txt` file
- Push notifications go through **Expo's push service** (`expo-server-sdk`), not Firebase directly — the mobile app gets an Expo push token and registers it via `PATCH /users/me/push-token`. This avoids needing a Firebase project for local testing; a standalone (non-Expo-Go) production build will eventually need `eas credentials` set up for Android push, but that's a later-phase concern, not now.

Mobile (`mobile/src/screens/media`):
- `UploadMediaScreen` — pick from gallery or camera (image or video), optional caption, upload
- `MediaFeedScreen` — org feed with a horizontal player-filter chip row ("All" + each member), image thumbnails, tap-to-open for video (external player, since there's no in-app video player yet)
- Push token is registered automatically after login/signup/restore (`src/notifications/registerPushToken.ts`); fails silently and never blocks the app if permissions are denied or the platform doesn't support it (e.g. web)
- Verified visually end-to-end in the browser: feed renders real uploaded thumbnails from the backend, player-filter chips correctly scope the list (confirmed both a player with uploads and one with none)
- Note: `npm run web` now runs on **port 8090**, not Expo's default 8081 — another local project on this machine (SportScoreApp) already uses 8081. The browser-preview launch config for this now lives at the repo root's `.claude/launch.json` (shared with that other project's entry), not inside `mobile/`.

### Phase 1D — what's implemented

Backend (`backend/src/chat`):
- `GET /chat/messages` — last 50 messages for your org, chronological, JWT + org-gated like everything else
- `ChatGateway` (Socket.IO, `@nestjs/websockets`) — client connects with `{ auth: { token } }`, the gateway verifies the JWT itself (not the HTTP guard, since this is a raw socket connection), loads the user, resolves their org, and joins them to a `org:<id>` room. An invalid/missing token gets disconnected immediately in `handleConnection` — verified with a garbage token.
- `message:send` (client → server) persists the message then broadcasts `message:new` to everyone in that org's room, including the sender — the client doesn't optimistically render its own message, it waits for this echo, which keeps the UI logic and message list simple (no de-duplication needed)
- Verified with a two-socket test script (coach + player1 connected simultaneously): messages sent by either side were received in real time by both, chat history persisted correctly to Postgres, and the WebSocket auth rejection path works

Mobile (`mobile/src/screens/chat/ChatScreen.tsx`):
- Loads history via REST on open, then opens a `socket.io-client` connection for live updates; own messages right-aligned/dark, others left-aligned with sender name
- Verified visually in the browser: chat history rendered correctly from two earlier test messages, sent a new message through the real UI, watched it round-trip through the actual WebSocket connection and appear in the bubble list, then confirmed via REST that it was actually persisted to the database (not just a local echo)

### Phase 1E — what's implemented

Backend (`backend/src/scrims`):
- `POST/GET/PATCH/DELETE /scrims` — any org member can create a scrim or tournament entry (title, scheduled time, platform/link, notes); the org-wide list is sorted chronologically
- Edit/delete is restricted to **the entry's creator or any coach in the org** — verified: a third player got a 403 trying to edit someone else's entry, the owner could edit their own, and a coach could edit anyone's
- Org isolation verified the same way as every other org-scoped resource: a user with no org gets a 404, never another org's data

Mobile (`mobile/src/screens/scrims`):
- `ScrimsListScreen` — entries grouped into Upcoming/Past sections, with Edit/Delete links shown only when the viewer actually has permission (mirrors the backend rule)
- `AddEditScrimScreen` — shared create/edit form; uses the native Android date/time picker (`@react-native-community/datetimepicker`), with a plain text datetime field as a web fallback since that library has no real web implementation
- **Bug found and fixed during verification**: the list screen only reloaded data on first mount, so creating an entry and navigating back showed stale data until a manual pull-to-refresh. Switched to `useFocusEffect` so the list refetches every time the screen regains focus. Confirmed fixed by creating an entry through the actual UI and seeing it appear immediately on return.
- Verified visually end-to-end: added a scrim through the real form, saw it appear in the right section with the right badge color, opened it in edit mode and confirmed every field was pre-filled correctly; delete itself could only be confirmed via the API, since `Alert.alert`'s confirmation dialog is a no-op on the web build (same pre-existing limitation noted in Phase 1B — real on Android)

### Phase 1F — what's implemented, and one real caveat

**Caveat up front:** this sandbox has no real `ANTHROPIC_API_KEY`, so I could not test the actual AI vision call end-to-end. Everything *around* it — permissions, name-matching, edit/confirm/reject, the leaderboard math, the mobile review UI — was verified by manually seeding a `StatExtraction` row in the database with realistic AI-shaped output and running it through the real confirm/reject flow. That is a deliberate substitute for the one part I couldn't reach, not a skipped test. Once you add your key, the one thing worth checking yourself is that `POST /stats/extractions` on a real screenshot returns sensible names and numbers — everything downstream of that response is already proven to work.

Backend (`backend/src/stats`):
- `StatsAiService` — isolated from the rest of the module on purpose, so the one untestable part (the live Anthropic call) has the smallest possible surface. Uses `client.messages.parse()` with a Zod schema (`@anthropic-ai/sdk/helpers/zod`) so the model's output is guaranteed to parse as `{ players: [{ name, kills, deaths, assists }] }` — no manual JSON-extraction/regex parsing of free text. Model is `claude-opus-5` by default, overridable via `ANTHROPIC_MODEL`.
- `POST /stats/extractions { mediaPostId }` — org-gated, image-only (rejects videos), one extraction per screenshot (409 on a duplicate). Reads the file off disk, base64-encodes it, sends it to Claude, then matches each returned name against the org roster's `name`/`inGameName` (case-insensitive exact match) — unmatched names are left for a human to resolve in the review UI, not guessed at.
- `GET/PATCH /stats/extractions` — list and edit suggested rows while still `PENDING`
- `POST /stats/extractions/:id/confirm` — only the requester or a coach can confirm (same ownership rule as Phase 1E scrims); creates one `PlayerStat` row per matched player, dated to when the screenshot was actually uploaded (not when it's confirmed) — rows with no matched player are silently skipped, never guessed into existence
- `POST /stats/extractions/:id/reject` — discards it, no stats written
- `GET /stats/leaderboard`, `GET /stats/players/:id` — org-wide aggregate and per-player history, aggregated in application code (small scale, no need for SQL-level grouping yet)
- Verified: no-API-key path returns a clean 503 (not a crash); a seeded extraction went through edit → permission-denied for a non-owner/non-coach (403) → confirm by the owner → leaderboard and per-player totals updated correctly; reject path leaves the leaderboard untouched; duplicate extraction on the same screenshot correctly 409s

Mobile (`mobile/src/screens/stats`):
- `StatsHomeScreen` — leaderboard sorted by kills, plus a "Pending Review" section for anything awaiting confirmation
- `ExtractionReviewScreen` — shows the actual screenshot alongside each AI-suggested row, with tap-to-match chips against the org roster and editable K/D/A fields, Confirm/Discard actions
- `PlayerStatsScreen` — one player's totals (K/D/A, computed K/D ratio) and match-by-match history
- Added an "Extract Stats" link on image posts in the Media feed
- Verified visually end-to-end in the browser using the seeded extraction: corrected two AI-mismatched names via the chip picker, confirmed, watched the leaderboard update live with the right sort order and K/D math

### Phase 1G — voice channels, and the biggest caveat in this whole build

**Read this before trying voice.** This phase fundamentally changes the mobile app: voice requires `react-native-webrtc`-family native modules, which **do not run in Expo Go**. Every other feature in this app still works in Expo Go; voice does not. You now need Android Studio/SDK installed on your actual machine to build and test it — this sandbox has none of that (confirmed: no `ANDROID_HOME`, no `adb`, no `java`), so **the mobile voice code below is written but genuinely untested on a device.** The backend is a different story — it's fully testable here and I pushed that as far as it goes.

Two interchangeable voice backends, switched with one env var:

```
VOICE_SELF_HOSTED=true   # self-hosted mediasoup SFU (default)
VOICE_SELF_HOSTED=false  # hosted LiveKit Cloud
```

**Backend — self-hosted (`backend/src/voice`), fully tested:**
- `MediasoupSfuService` starts one real mediasoup worker (the actual native SFU binary — it compiled successfully in this sandbox, confirmed via `mediasoup worker started` in the logs) and creates one audio-only Router per org, lazily
- `VoiceGateway` (Socket.IO namespace `/voice`) implements the standard mediasoup signaling protocol: `getRtpCapabilities`, `createTransport`, `connectTransport`, `produce`, `consume`, `resumeConsumer`, plus `newProducer`/`producerClosed`/`peerLeft` broadcasts to the org room
- **Verified with a real two-client test script** as far as possible without a real WebRTC peer: both clients connected and authenticated, fetched real RTP capabilities from the live router, created a real WebRTC transport (got back genuine ICE candidates and DTLS parameters), disconnect correctly notified the other peer, and an invalid token was correctly rejected. What's *not* tested is an actual audio stream flowing end-to-end — that requires a real `RTCPeerConnection` performing ICE/DTLS, which means an actual device.
- **A real bug found and fixed**: a rejected (bad-token) connection crashed the *entire backend process*, not just that connection — `client.data` defaults to `{}` in Socket.IO (never `undefined`), so my original `if (!data) return` guard in `handleDisconnect` never caught the case where auth failed before our own data was attached. Fixed to check a field we actually set (`data.orgId`) instead. Re-tested: the same bad-token scenario now gets cleanly rejected with no crash.

**Backend — hosted (LiveKit), tested as far as possible without a real account:**
- `VoiceService` generates a LiveKit access token (room = org, standard `roomJoin`/`canPublish`/`canSubscribe` grants) via `livekit-server-sdk`
- Verified: with no `LIVEKIT_*` credentials set, `GET /voice/config` returns a clean 503, not a crash; with fake-but-correctly-shaped credentials, decoded the generated JWT and confirmed every claim (room id, user identity, grants) was correct. Actually connecting to a real LiveKit room needs a real account, which this sandbox doesn't have.
- Confirmed the self-hosted mediasoup worker correctly does **not** start at all when `VOICE_SELF_HOSTED=false` (no wasted resources for the mode you're not using).

**Mobile (`mobile/src/voice`, `mobile/src/screens/voice`) — written, not device-tested:**
- `useSelfHostedVoiceChannel` — `mediasoup-client` wired to the backend's signaling protocol, using mediasoup-client's official `ReactNative106` handler
- `useHostedVoiceChannel` — thin wrapper over LiveKit's `Room` class (`livekit-client`)
- `VoiceChannelScreen` picks whichever hook matches what `GET /voice/config` reports, so the app doesn't need its own toggle — it just follows the backend
- **A real native-module conflict I caught before it caused damage**: `react-native-webrtc` and `@livekit/react-native-webrtc` both register the same native module name and cannot coexist in one build (the latter is a fork meant to replace the former, not sit beside it). Standardized on `@livekit/react-native-webrtc` as the single WebRTC implementation for *both* code paths — mediasoup-client doesn't care which one provides the global `RTCPeerConnection`, so this keeps the backend-driven toggle working without a native-dependency clash.
- **A second real risk I caught before it broke everything else**: the self-hosted hook statically imports `@livekit/react-native-webrtc`, which *throws at import time* when its native module isn't present — meaning on an ordinary import, the **entire app bundle would crash on web**, taking down every other already-working feature in the browser-based testing this whole project has relied on. Fixed with Metro's platform-file resolution: `VoiceChannelScreen.web.tsx` is a plain stub with no native-dependent imports at all, which Metro picks automatically for web builds instead of the real screen. Verified both ways: `npx expo export --platform web` now bundles cleanly (696 modules, no crash), and `npx expo export --platform android` bundles the real voice code successfully (1215 modules).
- Audio-only (no video) — matches "voice channel", not a video call
- No TURN server is configured. Fine for devices on the same WiFi; two devices on different networks won't connect without one. Not set up in this phase — flagging it rather than silently shipping something that only half-works.

**What I did to compensate for not having a device:** ran `npx expo prebuild --platform android` (this only templates native project files — no Android SDK needed) to confirm the config plugins actually apply: verified `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS` landed in the real `AndroidManifest.xml` and the app's package id (`com.teamcoach.app`, newly set — it didn't exist before this phase) is correctly wired through. This is as far as this sandbox can verify; it is not the same as a successful Gradle build, which needs Android Studio/SDK on your machine. The generated `android/`/`ios/` folders are gitignored by design (Expo's "Continuous Native Generation" — regenerate with `npx expo prebuild --clean` after any native config change, don't hand-edit them).

**To actually try voice yourself:** install Android Studio (which bundles the SDK), then from `mobile/`: `npx expo run:android`. For hosted mode, sign up free at [cloud.livekit.io](https://cloud.livekit.io) and fill in the three `LIVEKIT_*` keys in `backend/.env.development`.
