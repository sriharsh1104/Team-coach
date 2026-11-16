# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: builder
#   - Installs ALL deps (dev + prod)
#   - Generates Prisma client (native query-engine binaries)
#   - Compiles TypeScript → dist/
# ─────────────────────────────────────────────────────────────────────────────
# Debian (glibc), not Alpine: mediasoup ships a prebuilt worker binary for
# linux-x64 glibc. On Alpine/musl it can't run, so mediasoup falls back to a
# from-source build (python3/make/g++, several minutes) or silently fails and
# the server logs "mediasoup worker did not start" → voice never works.
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# openssl/ca-certificates: Prisma engines + mediasoup's prebuilt-worker
# download. python3 + pip + make + g++: mediasoup compiles its worker from
# source whenever no prebuilt binary matches the build host (the prebuilt
# name embeds the host kernel major, e.g. linux-x64-kernel7, and only a few
# kernels are published) — it pip-installs invoke/meson/ninja into its own
# folder and then needs a C++ toolchain. Takes a few minutes, once per build.
ENV PIP_BREAK_SYSTEM_PACKAGES=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates python3 python3-pip make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install deps first so Docker layer-caches node_modules when only src changes
COPY package*.json ./
RUN npm ci

# Copy schema before generate so the binary is built for linux/x64
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest and build
COPY . .
RUN npm run build

# Drop devDependencies here so the production stage can copy node_modules
# as-is — no second `npm ci` (which would re-run every native postinstall,
# mediasoup's worker download included, inside the slim runtime image).
RUN npm prune --omit=dev

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: production
#   - Only production deps (no devDependencies in the final image)
#   - Copies compiled dist/ and the generated Prisma engine
#   - Runs as non-root user
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Production node_modules (already pruned in the builder) — includes the
# generated Prisma client/engine and the mediasoup worker binary.
COPY package*.json ./
COPY --from=builder /app/node_modules    ./node_modules

# Copy compiled app
COPY --from=builder /app/dist           ./dist

# Copy Prisma schema + migrations (needed for prisma migrate deploy)
COPY --from=builder /app/prisma         ./prisma

# Media uploads directory (also mounted as a Docker volume in compose)
RUN mkdir -p uploads

# Run as non-root for security
RUN groupadd --system appgroup && useradd --system --gid appgroup --home /app appuser \
    && chown -R appuser:appgroup /app
USER appuser

COPY docker-entrypoint.sh /docker-entrypoint.sh
# entrypoint is copied from the builder context; must be executable
USER root
RUN chmod +x /docker-entrypoint.sh
USER appuser

EXPOSE 3000
# mediasoup RTC range (published in docker-compose.prod.yml)
EXPOSE 40000-40100/udp 40000-40100/tcp

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
