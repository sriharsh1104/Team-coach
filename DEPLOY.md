# Contabo VPS Deployment Guide

This guide covers deploying the Team Coach backend (NestJS + PostgreSQL) to a fresh Ubuntu VPS.

---

## 1. First-time VPS setup

```bash
# Log in as root (Contabo sends SSH credentials by email)
ssh root@YOUR_SERVER_IP

# Create a non-root deploy user
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/.ssh

# Log out of root, re-login as deploy
exit
ssh deploy@YOUR_SERVER_IP
```

### Install Docker

```bash
# Remove old versions if any
sudo apt-get remove docker docker-engine docker.io containerd runc

# Install
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow deploy user to run docker without sudo
sudo usermod -aG docker deploy
newgrp docker

# Verify
docker --version
docker compose version
```

---

## 2. Deploy the project

```bash
# On the VPS, clone the repo (or copy files via rsync/scp)
git clone https://github.com/YOUR_ORG/team-coach.git /srv/team-coach
cd /srv/team-coach

# Create the postgres-backups directory (compose bind-mounts it)
mkdir -p postgres-backups

# Copy the env template and fill in secrets
cp backend/.env.production.example backend/.env.production
nano backend/.env.production   # or vim, whatever you prefer
```

**Required values to fill in `backend/.env.production`:**

| Key | What to put |
|-----|-------------|
| `POSTGRES_PASSWORD` | A long random string (e.g. `openssl rand -hex 32`) |
| `JWT_SECRET` | 64 random chars (e.g. `openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID/SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://api.yourdomain.com/auth/google/callback` |
| `CORS_ORIGIN` | Your frontend URL |
| `MEDIASOUP_ANNOUNCED_IP` | Your server's public IP |
| `GEMINI_API_KEY` | From Google AI Studio |
| `RESEND_API_KEY` | From resend.com |

---

## 3. Build and start

```bash
cd /srv/team-coach

# First deploy — builds Docker image, starts postgres + backend
docker compose -f docker-compose.prod.yml up -d --build

# Check logs
docker compose -f docker-compose.prod.yml logs -f
```

Prisma migrations run automatically on startup (`RUN_MIGRATIONS=true` in the env file).  
You can also run them manually at any time:

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

---

## 4. Updating after a code change

```bash
cd /srv/team-coach

# Pull latest code
git pull origin main

# Rebuild only the backend image, then restart it
docker compose -f docker-compose.prod.yml up -d --build backend

# Watch the logs
docker compose -f docker-compose.prod.yml logs -f backend
```

Postgres data is in a named Docker volume and is **not affected** by rebuilds.

---

## 5. Set up Nginx + HTTPS (recommended)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Create a site config
sudo nano /etc/nginx/sites-available/team-coach
```

Paste:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # REQUIRED for media uploads. nginx's default is 1 MB, so photos/videos
    # bigger than that die with 413 / a dropped connection before reaching the
    # API. Must be >= the largest API limit (POST /media = 100 MB).
    client_max_body_size 110m;
    client_body_timeout  300s;
    proxy_send_timeout   300s;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;   # needed for WebSocket / SSE
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/team-coach /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL cert (auto-renews via cron)
sudo certbot --nginx -d api.yourdomain.com
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
# Allow mediasoup UDP range (voice calls)
sudo ufw allow 40000:40200/udp
sudo ufw allow 40000:40200/tcp
sudo ufw enable
```

### Media uploads (chat photos / videos / avatars)

Without `CLOUDINARY_*` the API writes uploads to `MEDIA_UPLOAD_DIR` on local disk.

- **Contabo / this compose file:** fine — `uploads` is a named Docker volume, survives deploys.
- **Render (or any PaaS):** NOT fine — the container disk is wiped on every restart /
  free-tier spin-down, so chat images and avatars 404 within minutes. Set the four
  `CLOUDINARY_*` env vars there (free tier at cloudinary.com) or move to the VPS.
  The backend logs a warning at startup in production when Cloudinary is off.

### Voice (mediasoup) checklist

Voice signaling goes over the normal API port, but the **audio itself** goes
over WebRTC on ports 40000–40200. All three must be true or you get
"connected" with no sound:

1. `backend/.env.production` → `MEDIASOUP_ANNOUNCED_IP=<VPS public IP>` (not 127.0.0.1)
2. `docker-compose.prod.yml` publishes `40000-40200` udp+tcp on the backend service (already done)
3. Firewall (ufw above, **and** the Contabo panel firewall if enabled) allows the same range

Verify after `docker compose up`:

```bash
docker compose -f docker-compose.prod.yml logs backend | grep -i mediasoup
# expect: "mediasoup worker started" — if you see "did not start", the worker
# binary is missing (image must be Debian/glibc, see backend/Dockerfile)
```

Render (and most PaaS free tiers) cannot host this: they don't expose UDP
port ranges. Either run the backend on a VPS like this, or set
`VOICE_SELF_HOSTED=false` and use hosted LiveKit.

---

## 6. Database backups

```bash
# Manual backup — saved to postgres-backups/ on the host
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U team_coach team_coach > postgres-backups/backup-$(date +%Y%m%d-%H%M%S).sql

# Restore a backup
cat postgres-backups/backup-YYYYMMDD-HHMMSS.sql | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U team_coach team_coach
```

Add a cron job for daily auto-backups:

```bash
crontab -e
# Add:
0 2 * * * cd /srv/team-coach && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U team_coach team_coach > postgres-backups/backup-$(date +\%Y\%m\%d-\%H\%M\%S).sql
```

---

## 7. Optional: pgAdmin web UI

```bash
# Start pgAdmin (accessible at http://YOUR_SERVER_IP:5050)
docker compose -f docker-compose.prod.yml --profile pgadmin up -d pgadmin
```

> **Security**: pgAdmin is not behind SSL here. Either put it behind Nginx with auth or only open port 5050 temporarily via `ufw` when you need it.

---

## 8. Useful commands

```bash
# See all container statuses
docker compose -f docker-compose.prod.yml ps

# Backend logs (live)
docker compose -f docker-compose.prod.yml logs -f backend

# Postgres logs
docker compose -f docker-compose.prod.yml logs -f postgres

# Open a psql shell
docker compose -f docker-compose.prod.yml exec postgres psql -U team_coach team_coach

# Restart a single service
docker compose -f docker-compose.prod.yml restart backend

# Stop everything (data volumes are preserved)
docker compose -f docker-compose.prod.yml down

# Stop everything AND delete volumes (DESTRUCTIVE — loses all DB data)
docker compose -f docker-compose.prod.yml down -v
```

## Releasing a new APK (in-app update popup)

While the app is shared as an APK (no Play Store), existing users get an
"Update available" popup that downloads and installs the new build in-app.

1. Bump `version` in `mobile/app.config.ts` (e.g. `1.0.2` → `1.0.3`) and build the APK.
   **Sign it with the same keystore as the previous builds** — Android refuses to
   update an app over a build signed with a different key.
2. Upload the APK somewhere with a **direct** https download link (GitHub
   Release asset, or a file served by your own nginx). Google Drive "share"
   links do not work — they open a confirmation page, not the file.
3. In `backend/.env.production` set:
   ```
   APP_LATEST_VERSION=1.0.3
   APP_APK_URL=https://.../SacredTeamCoach.apk
   APP_UPDATE_NOTES=Guild voice, game invite links
   # optional: builds older than this cannot dismiss the popup
   APP_MIN_VERSION=1.0.2
   ```
4. Apply it: `docker compose -f docker-compose.prod.yml up -d` (a plain `restart`
   does not re-read the env file).
5. Check: `curl "https://<api>/app/update?version=1.0.0"` → `"updateAvailable": true`.

Only builds that already contain this feature can show the popup, so the first
build with it must still be shared manually.
