#!/bin/sh
set -e

# Auto-run Prisma migrations before starting the app.
# Set RUN_MIGRATIONS=true in .env.production to enable.
# Safe to run on every start — Prisma is idempotent (skips applied migrations).
if [ "${RUN_MIGRATIONS}" = "true" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  npx prisma migrate deploy
  echo "[entrypoint] Migrations done."
fi

exec "$@"
