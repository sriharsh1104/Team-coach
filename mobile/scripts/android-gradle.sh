#!/usr/bin/env bash
# Run Gradle with a PATH that always includes Node (nvm or system).
# Bare `./gradlew` from some terminals hits:
#   Cannot run program "node" … Failed to exec spawn helper
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/android"

# Prefer the shell's node; fall back to common nvm install.
if ! command -v node >/dev/null 2>&1; then
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
  fi
fi
if command -v node >/dev/null 2>&1; then
  export PATH="$(dirname "$(command -v node)"):$PATH"
fi

# Stale daemons sometimes keep a bad spawn environment from a previous shell.
./gradlew --stop >/dev/null 2>&1 || true

exec ./gradlew "$@"
