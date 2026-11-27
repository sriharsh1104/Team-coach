# Google Play Console — Privacy & Publish Checklist

Sacred Team Coach / Sacred Esports. Fill these in **Play Console → App content** and **Store listing**. Keep the public pages live on **https://sacredesports.com**.

| Play field | URL / value |
|------------|-------------|
| Privacy policy | https://sacredesports.com/privacy |
| Account deletion (web) | https://sacredesports.com/delete-account |
| Terms (optional but recommended) | https://sacredesports.com/terms |
| Privacy contact email | sacredesportsss@gmail.com |
| In-app privacy | Settings → Privacy Policy |
| In-app deletion | Settings → Account Settings → Delete Or Deactivate |

Deploy the `web/` site (including `/privacy`, `/terms`, `/delete-account`) before submitting. URLs must be public, non-PDF, and not geo-blocked.

---

## 1. Privacy policy (required)

1. Play Console → **App content** → **Privacy policy** → paste `https://sacredesports.com/privacy`
2. Confirm the page loads without login and names **Sacred Esports** / **Sacred Team Coach**
3. App already links the same URL under Settings

---

## 2. Account deletion (required)

Play requires deletion **in-app** and a **web URL**.

| Path | Status |
|------|--------|
| In-app | Settings → Account Settings → Delete Or Deactivate |
| Web | https://sacredesports.com/delete-account |

In **App content → Data safety / Account deletion**:

- Users can request deletion: **Yes**
- Web link: `https://sacredesports.com/delete-account`
- Deletion removes account data (not only deactivate): **Yes**
- Note: team owners must transfer/delete the team first (shown in UI + privacy policy)

---

## 3. Data safety form (required)

**App content → Data safety** — answers aligned with the live Privacy Policy.

### Overview

| Question | Answer |
|----------|--------|
| Does the app collect or share required user data types? | **Yes** |
| All data encrypted in transit? | **Yes** (HTTPS / TLS) |
| Users can request data deletion? | **Yes** |

### Data types to declare

Check these (and mark **Collected**; share only where teammates / providers see data as part of the product):

| Category | Data type | Collected | Shared* | Purpose | Optional? | Ephemeral? |
|----------|-----------|-----------|---------|---------|-----------|------------|
| Personal info | Name | Yes | Yes (teammates) | App functionality, Account management | No | No |
| Personal info | Email | Yes | No† | App functionality, Account management | No | No |
| Personal info | User IDs | Yes | Yes (team) | App functionality | No | No |
| Personal info | Phone number | Yes | Yes (if user shows to members) | App functionality | **Yes** | No |
| Photos and videos | Photos / videos | Yes | Yes (team media) | App functionality | **Yes** | No |
| Audio files | Voice / sound recordings | Yes | Yes (live voice to peers) | App functionality | **Yes** | Approx. **Yes** for live voice (not stored as user library by default) |
| Health and fitness | Physical activity / steps | Yes | No | App functionality | **Yes** | No |
| Messages | Other in-app messages | Yes | Yes (teammates) | App functionality | No | No |
| App info & performance | Crash logs / diagnostics (if any via OS / FCM) | Yes (as applicable) | With Google FCM as processor | Analytics / App functionality | — | — |
| Device or other IDs | Device / push IDs | Yes | With FCM | App functionality, Notifications | No | No |

\* “Shared” = disclosed to third parties **outside** the service’s own encrypted processing, **or** Play’s definition of sharing with other companies. Teammate visibility is product functionality — follow Play’s latest wording; when unsure, declare and explain “shared with other users of the app”.

† Email is not shown publicly; admins/support may see it for account ops.

**Do not declare** (unless you add the feature later): location, contacts, SMS, call log, calendar, financial info, ads ID for advertising, web browsing history.

### Handling

- **Sold**: No for all types  
- **Encryption in transit**: Yes  
- **Deletion**: Users can request deletion  

### Third-party SDKs

Declare data handled by SDKs you ship, including:

- **Firebase Cloud Messaging** (push) — device IDs / tokens  
- **Google Sign-In** — account identifiers when user chooses Google  
- Voice / WebRTC / LiveKit (or mediasoup path) — audio/video for calls  

Check each SDK’s Data safety guidance and merge into your form.

---

## 4. Permissions & declarations

Sensitive / notable Android permissions in the app:

| Permission | Why |
|------------|-----|
| `RECORD_AUDIO` / mic FGS | Team voice |
| `CAMERA` | Voice video / capture |
| `READ_MEDIA_*` / storage | Avatars, chat media, screenshots |
| `POST_NOTIFICATIONS` | Push |
| `ACTIVITY_RECOGNITION` | Phone step counter (Health) |
| `USE_BIOMETRIC` | Optional app unlock |
| `FOREGROUND_SERVICE_*` | Voice / screen share |
| `BLUETOOTH` | Voice accessories |

Complete any **Permissions declaration** / **Photo and video permissions** forms Play shows for your bundle. Core use cases: team chat media + voice coaching app.

### Play Store blockers to fix before production AAB

1. **`REQUEST_INSTALL_PACKAGES`** — used for sideload APK updates. **Remove for the Play build** (updates must go through Play). Keep sideload updates only on non-Play APK tracks.
2. Ship an **AAB** (not a public APK) for production.
3. Complete **Content rating**, **Target audience**, **News / COVID / Ads** questionnaires as shown (Ads: **No** if you don’t show ads).
4. **Families** / designed for children: only if you intentionally target kids; otherwise declare the appropriate age group (typically 13+ / 18+ as applicable).

---

## 5. Store listing copy (suggested)

- **App name**: Sacred Team Coach  
- **Short description**: Team chat, voice, stats, and habits for Sacred Esports squads.  
- **Full description**: Mention account required, privacy policy link, and that users can delete accounts in-app or at sacredesports.com/delete-account.

---

## 6. Pre-submit checklist

- [ ] `https://sacredesports.com/privacy` live  
- [ ] `https://sacredesports.com/delete-account` live  
- [ ] Privacy URL saved in Play Console  
- [ ] Data safety form submitted (matches this doc)  
- [ ] Account deletion questions + web URL filled  
- [ ] Content rating questionnaire done  
- [ ] Play AAB **without** `REQUEST_INSTALL_PACKAGES` / in-app APK updater  
- [ ] Screenshots + feature graphic uploaded  
- [ ] Test track install works; reviewer login (if closed) documented in App access  

---

## 7. Reviewer notes (App access)

If the app is invite/org locked, provide in **App content → App access**:

- Test email + password (or Google test account)  
- Steps: sign in → join/create org if needed → open Chat / Voice / Health steps  

Contact for review issues: sacredesportsss@gmail.com
