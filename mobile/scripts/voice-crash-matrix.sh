#!/usr/bin/env bash
# Capture Android logcat while reproducing guild/team voice force-closes.
# Silent kills leave no JS ErrorBoundary — use this + Nest /voice/join-log.
#
# Usage:
#   ./scripts/voice-crash-matrix.sh            # interactive checklist + live logcat
#   ./scripts/voice-crash-matrix.sh --dump     # dump filters after a kill (pid gone)
set -euo pipefail

PKG="com.teamcoach.app"
OUT_DIR="${TMPDIR:-/tmp}/teamcoach-voice-crash"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$OUT_DIR/matrix-$STAMP.log"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found — install Android platform-tools." >&2
  exit 1
fi

DEVICES="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
if [[ -z "$DEVICES" ]]; then
  echo "No adb device in 'device' state." >&2
  echo "Plug in a phone (USB debugging on) or start an emulator, then re-run." >&2
  echo "APK: android/app/build/outputs/apk/release/SacredTeamCoach-*.apk" >&2
  echo "Build: npm run build:apk:release" >&2
  exit 1
fi

echo "Device(s): $DEVICES"
echo "Log file:  $LOG"
echo
echo "Manual matrix (note stays-up / force-close / JS error screen + Nest join-log):"
echo "  1. Guild chat only (headset visible, do not tap) — expect occupancy DEBUG, no crash"
echo "  2. Tap headset → Guild Voice lobby (Join visible)"
echo "  3. Tap Join Voice Channel"
echo "  4. Leave / rejoin; team ↔ guild if used"
echo "  5. Background within and after ~2.5s of connect (FGS)"
echo "  6. Notification Mute / Deafen / Leave"
echo "  7. Voice changer before join and mid-call"
echo "  8. Floating widget: leave Guild Voice while connected, reopen guild chat"
echo "  9. Optional: airplane mid-call, second-device duplicate, host kick"
echo
echo "Map last [voice-join] line before death:"
echo "  click → died before AudioSession"
echo "  audio-session / connect → WebRTC / LiveKit native"
echo "  mic-on → voice changer / mic publish"
echo "  connected then silence → FGS / OEM background kill"
echo

if [[ "${1:-}" == "--dump" ]]; then
  {
    echo "=== dump $STAMP ==="
    adb logcat -d | rg -i \
      'com\.teamcoach\.app|AndroidRuntime|FATAL|tombstone|signal 11|LiveKit|WebRTC|VoiceChanger|FGS|ForegroundService|ScreenRecorder|ReactNativeJS|\[voice-join\]' \
      || true
    echo "=== dropbox (head) ==="
    adb shell dumpsys dropbox --print 2>/dev/null | head -n 200 || true
  } | tee "$LOG"
  echo "Wrote $LOG"
  exit 0
fi

adb logcat -c
PID="$(adb shell pidof -s "$PKG" 2>/dev/null | tr -d '\r' || true)"
if [[ -z "$PID" ]]; then
  echo "App not running yet — launch $PKG, then Ctrl+C and re-run, or continue without --pid."
  echo "Streaming unfiltered package-relevant lines to $LOG (Ctrl+C to stop)…"
  adb logcat *:V | rg --line-buffered -i \
    'com\.teamcoach\.app|AndroidRuntime|FATAL|tombstone|LiveKit|WebRTC|VoiceChanger|ReactNativeJS|\[voice-join\]|ScreenRecorder|ForegroundService' \
    | tee "$LOG"
else
  echo "Streaming pid=$PID to $LOG (Ctrl+C to stop; if process dies run with --dump)…"
  adb logcat --pid="$PID" *:V | tee "$LOG"
fi
