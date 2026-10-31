# Team Coach — Web

React (Vite) website for Sacred Esports / Team Coach. Uses the **same NestJS backend** as `mobile/` — no separate API.

```
team-coach/
  backend/   ← shared API (port 3000)
  mobile/    ← Expo / React Native
  web/       ← this app (Vite, port 5173)
```

## Setup

```bash
cd web
npm install
```

Copy env if needed:

```bash
cp .env.example .env.development
# VITE_API_BASE_URL=http://localhost:3000
```

## Run (with backend)

Terminal 1:

```bash
cd backend
npm run start:dev
```

Terminal 2:

```bash
cd web
npm run dev
```

Open http://localhost:5173

Login / signup uses the same `/auth/*` endpoints as mobile. Chat uses the same Socket.IO gateway and `/chat/*` REST routes.

## Scripts

| Command        | What it does              |
|----------------|---------------------------|
| `npm run dev`  | Vite dev server (5173)    |
| `npm run build`| Production build → `dist` |
| `npm run preview` | Serve the production build |

## What’s included

- **Public home `/`** (no login): Sacred watermark background (same logo as mobile), APK download, tournament participation lanes, social handles + Instagram/Discord QR
- Team workspace at `/app` after login
- Auth: login, signup, email verify, 2FA
- Chat / members / profile / rule book / social (authenticated)

## APK link

Put the file at `public/downloads/sacred-esports.apk`, or set `VITE_APK_URL` to a hosted URL.
