import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { emitToast } from '../ui/toastBus';
import { checkForUpdate, currentAppVersion, downloadAndInstall, UpdateInfo } from './appUpdate';

/** Re-check when the app returns to the foreground, but not more often than this. */
const RECHECK_MS = 15 * 60 * 1000;

/**
 * "New version available" popup for APK-shared builds. Checked on launch and
 * whenever the app comes back to the foreground. "Update now" downloads the
 * APK inside the app and opens the installer; "Later" hides it until the next
 * launch (unless the server marked this build as too old to keep using).
 */
export function AppUpdatePrompt() {
  const styles = useThemedStyles(promptStyles);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const lastCheck = useRef(0);
  const busy = progress !== null;

  const check = useCallback(async () => {
    lastCheck.current = Date.now();
    const next = await checkForUpdate();
    if (next) setInfo(next);
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheck.current > RECHECK_MS) void check();
    });
    return () => sub.remove();
  }, [check]);

  const update = async () => {
    if (!info?.apkUrl || busy) return;
    setProgress(0);
    const result = await downloadAndInstall(info.apkUrl, setProgress);
    setProgress(null);
    if (result === 'failed') {
      emitToast('Could not download the update. Check your internet and try again.');
    } else if (result === 'opened-in-browser') {
      emitToast('Download the APK from your browser, then open it to install.');
    }
  };

  const visible = !!info && (info.forced || dismissedVersion !== info.latestVersion);
  if (!visible || !info) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.version}>
            Version {info.latestVersion} is ready (you have {currentAppVersion()}).
          </Text>
          {info.notes ? <Text style={styles.notes}>{info.notes}</Text> : null}
          {info.forced ? (
            <Text style={styles.forced}>This update is required to keep using the app.</Text>
          ) : null}

          {busy ? (
            <View style={styles.progressWrap}>
              <ActivityIndicator />
              <Text style={styles.progressText}>
                {progress >= 1 ? 'Opening installer…' : `Downloading ${Math.round(progress * 100)}%`}
              </Text>
            </View>
          ) : (
            <>
              <Pressable
                style={styles.primary}
                onPress={() => void update()}
                accessibilityRole="button"
                accessibilityLabel="Update now"
              >
                <Text style={styles.primaryText}>Update now</Text>
              </Pressable>
              {!info.forced && (
                <Pressable
                  style={styles.secondary}
                  onPress={() => setDismissedVersion(info.latestVersion)}
                  accessibilityRole="button"
                  accessibilityLabel="Later"
                >
                  <Text style={styles.secondaryText}>Later</Text>
                </Pressable>
              )}
            </>
          )}
          <Text style={styles.hint}>
            If Android asks, allow installs from this app once, then tap Install.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function promptStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 20, gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    title: { fontSize: 20, fontWeight: '800', color: c.text },
    version: { fontSize: 14, color: c.textMuted },
    notes: { fontSize: 14, color: c.text },
    forced: { fontSize: 13, color: c.danger, fontWeight: '600' },
    primary: { marginTop: 6, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#23a559' },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondary: { paddingVertical: 12, alignItems: 'center' },
    secondaryText: { color: c.textMuted, fontWeight: '700' },
    progressWrap: { alignItems: 'center', gap: 8, paddingVertical: 12 },
    progressText: { color: c.text, fontWeight: '600' },
    hint: { fontSize: 11, color: c.textDim, textAlign: 'center' },
  });
}
