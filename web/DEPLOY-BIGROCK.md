# Live on sacredesports.com (BigRock) — **web only**

Mobile / Nest backend alag rehte hain. Domain pe sirf yeh Vite site (`web/dist`) jayegi.

## Option A — BigRock hosting + cPanel (sabse seedha)

### 1) Domain BigRock pe ready ho

BigRock panel → **Domains** → `sacredesports.com` active dikhe.

Agar alag hosting package liya hai, domain usi account se **point / assign** karo.

### 2) Laptop pe build banao

```bash
cd web
npm install
npm run build
```

Output folder: `web/dist/`  
Iske andar `index.html`, `assets/`, `.htaccess`, logo, downloads, etc. hoga.

### 3) cPanel pe upload

1. BigRock → **cPanel** (ya File Manager)
2. Folder: `public_html/` (root domain ke liye yahi)
3. `public_html` ke purane default files hata do / backup
4. **`dist/` ke ANDAR ki saari files** upload karo  
   (matlab `dist/index.html` seedha `public_html/index.html` bane — `dist` folder khud mat chhodna)

FileZilla / cPanel Upload dono chalega.

### 4) Check

Browser: https://sacredesports.com

Tabs (Home / App / Records / Players) aur bottom social icons dikhne chahiye.

### 5) DNS (agar site nahi khul rahi)

BigRock → **DNS Management** for `sacredesports.com`:

| Type | Name | Value |
|------|------|--------|
| A | `@` | BigRock hosting ka IP (cPanel → Server Information) |
| A / CNAME | `www` | same IP, ya `@` / hosting CNAME jo BigRock bole |

DNS 15 min – 24 hrs lag sakta hai.

SSL: cPanel → **SSL/TLS Status** → AutoSSL / Let’s Encrypt enable → https force.

---

## Option B — Free host (Vercel / Cloudflare Pages) + BigRock DNS only

Hosting BigRock pe nahi, sirf domain BigRock pe.

**API / Nest server Cloudflare ke peeche:**  
[`DEPLOY-CLOUDFLARE.md`](../DEPLOY-CLOUDFLARE.md) — Contabo + DNS/proxy/tunnel (Workers pe Nest nahi).

**Sirf static web Pages pe:** Dashboard → Pages, root `web`, build `npm run build`, output `dist`  
(ya `web/wrangler.toml`). Domain BigRock DNS se CNAME.

Mobile / Nest backend Contabo pe hi (`DEPLOY.md`).

---

## APK

`public/downloads/sacred-esports.apk` rakho, phir dobara `npm run build` + upload.  
Ya `VITE_APK_URL` mein Google Drive / direct download URL set karke build lo.

---

## Baad mein backend

Jab API alag host ho (e.g. `api.sacredesports.com`):

1. `web/.env.production` mein `VITE_API_BASE_URL=https://api.sacredesports.com`
2. `npm run build` dubara
3. Backend `CORS_ORIGIN=https://sacredesports.com`

Abhi public marketing site ke liye backend zaroori nahi.
