# Firebase / FCM setup (Android push for APK)

Do these steps once. After that, testers who install the APK and allow
notifications will receive Expo pushes (chat, media, scrim reminders).

Package name (must match exactly): `com.teamcoach.app`

---

## A. Firebase project + Android app

1. Open [Firebase Console](https://console.firebase.google.com/) → **Add project**
   (or open an existing one). Name it e.g. `Sacred Team Coach`.
2. Skip / disable Google Analytics if you do not need it.
3. Project overview → **Add app** → **Android**.
4. Android package name: `com.teamcoach.app`
5. App nickname: `Sacred Team Coach` (optional).
6. SHA-1: leave blank for now (add later if Google Sign-In on release APK needs it).
7. Register → **Download `google-services.json`**.

## B. Put `google-services.json` in this repo

1. Copy the downloaded file to:
   `mobile/google-services.json`
   (same folder as `app.config.ts` — not the `.example` file).
2. Confirm `"package_name": "com.teamcoach.app"` inside the JSON.
3. This file is safe to commit (public client config).

`app.config.ts` already wires it via `android.googleServicesFile` when the file exists.

## C. FCM V1 service account key (secret — for Expo/EAS)

Expo’s servers need this so they can deliver Android notifications.

1. Firebase Console → ⚙ **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → confirm → a JSON file downloads
   (name like `sacred-team-coach-firebase-adminsdk-xxxxx.json`).
3. Move/rename it to something clear, e.g.:
   `mobile/firebase-service-account.json`
4. **Do not commit this file** (already in `.gitignore`).

### Upload to Expo (pick one)

**Option 1 — Expo website**

1. [expo.dev](https://expo.dev) → your project → **Credentials**.
2. Android → application id `com.teamcoach.app`.
3. Under **FCM V1 service account key** → **Add** → upload that JSON → Save.

**Option 2 — CLI** (from `mobile/`)

```bash
npx eas-cli login
npx eas-cli credentials
```

Then: Android → production → Google Service Account →
Manage FCM V1 → Upload a new service account key → select the JSON.

## D. EAS project id (for push tokens on APK)

1. From `mobile/`:

```bash
npx eas-cli login
npx eas-cli init
```

2. Copy the **Project ID** (UUID) from the Expo dashboard
   (Project settings) into `mobile/.env.production`:

```env
EAS_PROJECT_ID="your-uuid-here"
EAS_OWNER="your-expo-username"
API_BASE_URL="https://api.sacredesports.com"
```

## E. Build test APK

```bash
cd mobile
APP_ENV=production npx eas-cli build -p android --profile preview
```

When the build finishes, download the APK link and share with testers.

## Checklist — send these back when done

| Item | Where you got it | Put where |
|------|------------------|-----------|
| `google-services.json` | Firebase → Android app download | `mobile/google-services.json` |
| Service account JSON | Firebase → Project settings → Service accounts → Generate key | Upload to EAS Credentials (FCM V1); keep local copy gitignored |
| `EAS_PROJECT_ID` | expo.dev → Project settings | `mobile/.env.production` |
| Live `API_BASE_URL` | Your hosted Nest API | `mobile/.env.production` |

## Optional later (Google Sign-In on release APK)

SHA-1 of the EAS upload/signing key → Google Cloud OAuth Android client
+ paste into Firebase Android app settings. Not required just for push.
