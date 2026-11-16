# Sacred Esports — Desktop app (Linux + Windows) via Tauri

Same React/Vite website (`web/`) ko Tauri 2 ek native window mein chalata hai, taaki
laptop pe install karke seedha app kholo — browser pe jaane ki zaroorat nahi.

- Rust side: `web/src-tauri/` (chhota sa shell, koi custom Rust code nahi)
- Frontend: wahi `web/src/` — koi alag codebase nahi
- API: build time pe `VITE_API_BASE_URL` jo set hoga wahi (prod ke liye `https://api.sacredesports.com`)

Output:

| OS      | Installer                                   |
| ------- | ------------------------------------------- |
| Linux   | `.deb` (Ubuntu/Debian), `.rpm`, `.AppImage` |
| Windows | `*-setup.exe` (NSIS), `.msi`                |

---

## 1) One-time setup (Ubuntu / Debian laptop)

Rust pehle se `~/.cargo/bin` mein hai. Agar nahi:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

System libs (WebKitGTK etc.) — **sudo chahiye**, isliye yeh script khud chalao:

```bash
cd web && ./scripts/install-tauri-linux-deps.sh
```

Phir npm deps:

```bash
cd web && npm install
```

Check:

```bash
cd web && npx tauri info
```

## 2) Dev mode (window mein chalao, hot reload ke saath)

Backend `localhost:3000` pe chal raha ho (`.env.development` → `VITE_API_BASE_URL=http://localhost:3000`).

```bash
cd web && npm run desktop
```

Yeh `npm run dev` (Vite, port 5173) start karta hai aur Tauri window usse load karti hai.
Pehli baar Rust compile mein ~3–5 min lagte hain, uske baad fast.

## 3) Linux installer banao (laptop pe)

Prod API ke liye `web/.env.production` banao (gitignored):

```bash
cd web && cp .env.production.example .env.production
```

`.env.production` mein `VITE_API_BASE_URL=https://api.sacredesports.com` rakho. Phir:

```bash
cd web && npm run desktop:build
```

Output: `web/src-tauri/target/release/bundle/`

- `deb/sacred-esports_1.0.0_amd64.deb` → `sudo apt install ./sacred-esports_1.0.0_amd64.deb`
- `appimage/sacred-esports_1.0.0_amd64.AppImage` → `chmod +x` karke double-click
- `rpm/…` → Fedora/RHEL

Sirf ek chahiye to: `npm run desktop:build:deb` ya `npm run desktop:build:appimage`.

## 4) Windows installer banao

**Option A — GitHub Actions (recommended, Linux se cross-compile ka jhanjhat nahi):**

1. Repo → Settings → Secrets → Actions → `VITE_API_BASE_URL` = `https://api.sacredesports.com`
2. Actions tab → **Desktop app (Tauri)** → Run workflow
3. Run ke neeche artifacts: `sacred-esports-windows-latest` (`.exe` + `.msi`) aur `sacred-esports-ubuntu-22.04`

Release banana ho to tag push karo — draft GitHub Release ban jayegi jisme sab installers attach honge:

```bash
git tag desktop-v1.0.0 && git push origin desktop-v1.0.0
```

**Option B — Windows machine pe directly:**

1. Rust install (rustup.rs), Node 22, Microsoft C++ Build Tools, WebView2 (Win 10/11 pe pehle se hota hai)
2. `cd web && npm install && npm run desktop:build`
3. Output: `web\src-tauri\target\release\bundle\nsis\*-setup.exe` aur `msi\*.msi`

## 5) Backend CORS (prod mein zaroori)

Desktop app ka origin browser jaisa nahi hota:

- Linux / macOS: `tauri://localhost`
- Windows: `http://tauri.localhost`

Backend ab `CORS_ORIGIN` ko comma-separated list maanta hai (`backend/src/common/cors-origin.ts`).
Render / prod env mein:

```
CORS_ORIGIN=https://www.sacredesports.com,https://sacredesports.com,tauri://localhost,http://tauri.localhost
```

Bina iske desktop app se API calls CORS pe fail hongi (dev mein `*` hai to theek hai).

## 6) Known limits

- **Google sign-in desktop app mein off hai.** Google Identity Services sirf
  registered http(s) origins allow karta hai; `tauri://localhost` reject hota hai.
  App mein button dikhega par message dega — email + password se login karo.
  Agar chahiye to baad mein system-browser OAuth + deep-link flow add karna padega.
- External links (Discord, Instagram, APK) `target="_blank"` se system browser mein khulte hain (`tauri-plugin-opener`).
- Icons `public/sacred-logo-transparent.png` se bane hain. Logo badle to: `npm run desktop:icons`.
- Version badalni ho to `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml` dono mein `version` update karo.

## Files

```
web/
  src-tauri/
    Cargo.toml            Rust crate (tauri + opener plugin)
    tauri.conf.json       window size, bundle targets, dev/build commands
    build.rs, src/main.rs, src/lib.rs
    capabilities/default.json   permissions for the main window
    icons/                generated from the Sacred logo
  src/lib/platform.ts     isDesktopApp() — true inside Tauri
  scripts/install-tauri-linux-deps.sh
  vite.config.ts          Tauri-aware (strictPort, build target per OS)
.github/workflows/desktop-build.yml   Linux + Windows installers in CI
```

## 7) Website download links (home page buttons)

Home page pe **Download for Linux (.deb)** aur **Download for Windows (.exe)** real links hain
(koi "coming soon" nahi). Default mein yeh GitHub Releases ke *latest* release pe jaate hain,
stable file names ke saath — isliye har nayi release pe website change nahi karni padti:

```
https://github.com/sriharsh1104/Team-coach/releases/latest/download/sacred-esports-linux-x64.deb
https://github.com/sriharsh1104/Team-coach/releases/latest/download/sacred-esports-linux-x64.AppImage
https://github.com/sriharsh1104/Team-coach/releases/latest/download/sacred-esports-windows-x64-setup.exe
```

Yeh files `.github/workflows/desktop-build.yml` banata hai — tag push karte hi release publish:

```bash
git tag desktop-v1.0.0 && git push origin desktop-v1.0.0
```

Jab tak pehli release nahi hui, links 404 denge — isliye pehla tag jaldi push karo
(secret `VITE_API_BASE_URL` pehle set ho). Kahin aur host karna ho (jaise website ke
`public/downloads/`) to `.env.production` mein `VITE_DESKTOP_LINUX_URL` /
`VITE_DESKTOP_WINDOWS_URL` set karo.

Desktop app ke andar yeh buttons nahi dikhte, aur app seedha sign-in / sign-up section
(`/signin`) pe khulti hai — landing tabs (Home / What We Provide / Record / Roster) sirf browser pe.
