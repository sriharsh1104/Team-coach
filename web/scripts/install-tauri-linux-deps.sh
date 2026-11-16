#!/usr/bin/env bash
# One-time Ubuntu/Debian deps for building the Sacred Esports Tauri desktop app.
set -euo pipefail

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  build-essential \
  curl \
  wget \
  file \
  pkg-config \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libgtk-3-dev

echo
echo "Done. Next:"
echo "  cd web && npm run desktop        # run in a window"
echo "  cd web && npm run desktop:build  # make .deb / AppImage"
