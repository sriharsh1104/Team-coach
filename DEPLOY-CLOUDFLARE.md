# Cloudflare — ek hi Contabo VPS ke aage (optional)

**Poori app ek server pe chalti hai** (Nest + Postgres + `web/` static + voice).  
Setup: [`DEPLOY.md`](./DEPLOY.md) — Nginx pe `yourdomain.com` = site, `api.yourdomain.com` = API.

Cloudflare **us ek VPS ko replace nahi karta**. Sirf:

- DNS + orange-cloud proxy (DDoS / HTTPS edge)
- ya **Tunnel** (origin IP hide)

Nest/Postgres/mediasoup Cloudflare Workers pe **nahi** chalenge — shift = Contabo (ya koi ek VPS) pe sab.

```
Phone / browser
    │
    ├─ https://yourdomain.com      → Cloudflare? → VPS Nginx → /var/www (web/dist)
    ├─ https://api.yourdomain.com  → Cloudflare? → VPS Nginx → Nest :3000
    └─ UDP 40000–40200 (voice)     → seedha VPS IP (MEDIASOUP_ANNOUNCED_IP)
```

---

## Tumhe kya chahiye

1. Ek Contabo (ya similar) VPS — Docker + nginx pehle se (`DEPLOY.md`)
2. Domain
3. Cloudflare account (optional — bina CF ke bhi sirf VPS + certbot chalega)

---

## DNS (sab records isi VPS IP pe)

Cloudflare → DNS (ya registrar):

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | Contabo IP | Proxied OK |
| A | `www` | Contabo IP | Proxied OK |
| A | `api` | Contabo IP | Proxied OK |

SSL/TLS → **Full (strict)** jab VPS pe certbot cert ho (`DEPLOY.md` §5).

WebSockets: Network → On (Socket.IO / live / games).

**Voice:** UDP Cloudflare se nahi jati — firewall pe `40000–40200` open + `MEDIASOUP_ANNOUNCED_IP=<Contabo IP>`.

---

## Tunnel (optional)

Agar 80/443 Contabo pe public nahi kholna:

```bash
# VPS pe cloudflared install + login — details Cloudflare Zero Trust docs
cloudflared tunnel create sacred
cloudflared tunnel route dns sacred yourdomain.com
cloudflared tunnel route dns sacred www.yourdomain.com
cloudflared tunnel route dns sacred api.yourdomain.com
```

Ingress example: `yourdomain.com` → `http://127.0.0.1:80` (nginx),  
ya site root file serve + `api` → `http://127.0.0.1:3000`.  
UDP voice phir bhi direct IP.

---

## Shift checklist (sab ek jagah)

1. [ ] Ek VPS le lo, `DEPLOY.md` §§1–4 (Docker backend + DB)
2. [ ] §5 — `web` build → `/var/www/sacred-esports`, nginx site + api
3. [ ] DNS A records → usi IP
4. [ ] (Optional) Domain Cloudflare pe, orange cloud
5. [ ] Env: `CORS_ORIGIN`, `WEB_PUBLIC_URL`, `GOOGLE_CALLBACK_URL`, mobile `API_BASE_URL`
6. [ ] `curl https://api…/health` + browser pe site

Alag Cloudflare Pages / BigRock static host **mat** lo agar goal “ek server” hai — sab isi box pe.
