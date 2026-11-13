# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: builder
#   - Installs ALL deps (dev + prod)
#   - Generates Prisma client (native query-engine binaries)
#   - Compiles TypeScript → dist/
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install deps first so Docker layer-caches node_modules when only src changes
COPY package*.json ./
RUN npm ci

# Copy schema before generate so the binary is built for linux/x64
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest and build
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: production
#   - Only production deps (no devDependencies in the final image)
#   - Copies compiled dist/ and the generated Prisma engine
#   - Runs as non-root user
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled app
COPY --from=builder /app/dist           ./dist

# Copy Prisma schema + migrations (needed for prisma migrate deploy)
COPY --from=builder /app/prisma         ./prisma

# Copy the generated Prisma query-engine binary from the builder stage.
# @prisma/client JS wrapper is already installed via npm ci above;
# the native engine lives in .prisma and must come from the builder
# because it was compiled for the target platform (linux/x64/musl).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Media uploads directory (also mounted as a Docker volume in compose)
RUN mkdir -p uploads

# Run as non-root for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app
USER appuser

COPY docker-entrypoint.sh /docker-entrypoint.sh
# entrypoint is copied from the builder context; must be executable
USER root
RUN chmod +x /docker-entrypoint.sh
USER appuser

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
