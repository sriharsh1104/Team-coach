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
sudo ufw allow 40000:40100/udp
sudo ufw enable
```

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
