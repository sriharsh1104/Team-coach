# Team Coach

Esports team/org management platform — see the phase plan below for scope.
Everything currently runs locally for testing. No CI/CD yet; that comes once
you're ready to move beyond your laptop.

## Project layout

```
team-coach/
  backend/   NestJS API (TypeScript, Prisma, PostgreSQL)
  mobile/    React Native app (Expo, Android-first)
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

## Start

Each start script loads one env file. Fill that file before you run the matching command. Local development files already have working defaults; stage and production are placeholders.

### Laptop Chrome (see the UI)

Use this when you want the app in Chrome on this laptop. Android emulator address `10.0.2.2` does not work in the browser, so `npm run web` points the API at `http://localhost:3000`.

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

Chrome opens http://localhost:8081. The script loads `mobile/.env.development`, then overrides `API_BASE_URL`.

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
| `npm run web` | `.env.development`, with `API_BASE_URL=http://localhost:3000` | Opens the UI in Chrome at http://localhost:8081 |
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
| `mobile/.env.development` | `GOOGLE_ANDROID_CLIENT_ID` | Same Google Cloud project → create an **Android** OAuth client (package name from `mobile/app.config.ts`, SHA-1 from your debug keystore: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`). |

Until these are filled in, email/password signup and login work fully — only
the "Continue with Google" button is inert (it shows an alert telling you it's
not configured yet instead of crashing).

`JWT_SECRET` for development is already generated and set. When you move to
stage/production, generate your own with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Phase plan

| Phase | Scope |
|---|---|
| **0** (done) | Repo scaffold, Postgres, env files |
| **1A** (done) | Signup/login + Google OAuth, create/join org (code + referral link), 1 roster/org = max 5 players + unlimited coaches |
| **1B** | Player profile: multi-select roles, social links (WhatsApp/Insta/Discord/YouTube), IGN+UID with copy icon, device name/model (multiple), org member directory |
| **1C** | Media upload (image/video) + push notification to coach on every upload + coach media dashboard |
| **1D** | Org text chat (group chat, WebSocket) |
| **1E** | Manual scrim/tournament registration, org-only visibility, list/calendar |
| **1F** | AI stat extraction from screenshots (AI-suggests → human confirms in v1), per-player stats dashboard |
| **1G** | Voice channels — self-hosted signaling + mediasoup SFU + coturn |
| **2** | iOS app (reusing the React Native codebase) |

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
