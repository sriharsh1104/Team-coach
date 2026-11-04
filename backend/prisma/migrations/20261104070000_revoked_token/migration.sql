-- Per-token revocation list so POST /auth/logout can kill just the one
-- session that called it, instead of bumping User.tokenVersion and logging
-- out every device at once.
CREATE TABLE "RevokedToken" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");
