import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { BrandWatermark } from './src/brand/BrandWatermark';
import { RootNavigator } from './src/navigation/RootNavigator';
import { OrgRealtimeProvider } from './src/realtime/OrgRealtimeProvider';
import { useChatSocketSession } from './src/realtime/useChatSocketSession';
import { AppErrorBoundary } from './src/ui/AppErrorBoundary';
import { LoaderProvider } from './src/ui/SesLoader';
import { ToastProvider } from './src/ui/Toast';
import { ConfirmModalHost } from './src/ui/ConfirmModal';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RecordingProvider } from './src/recording/RecordingContext';
import { RecordingWidget } from './src/recording/RecordingWidget';
import { useAppPermissions } from './src/hooks/useAppPermissions';
import { useServerWakePing } from './src/hooks/useServerWakePing';
import { VoiceProvider } from './src/voice/VoiceContext';
import { AppUpdatePrompt } from './src/update/AppUpdatePrompt';
import { installInviteLinkListener } from './src/invite/inviteLinks';
import { startNetworkWatch } from './src/net/networkStatus';
import { warmUpServer } from './src/perf/serverWarmup';
import { OfflineBanner } from './src/ui/OfflineBanner';

// Catch roster/guild invite links from the very start (even while signed out).
installInviteLinkListener();
// Connectivity has to be known before the first request so the API layer can
// fail fast instead of sitting on a 15s timeout while the phone has no data.
startNetworkWatch();
// The free-tier backend sleeps when idle and takes up to a minute to wake.
// Starting that now means it is usually up by the time anyone has finished
// typing a password, instead of the login request paying for it.
warmUpServer();

/** Runs hooks that need AuthContext — must be rendered inside AuthProvider. */
function AuthenticatedEffects() {
  useServerWakePing();
  useChatSocketSession();
  return null;
}

function AppShell() {
  // Request notification + microphone permissions once on app start,
  // before the user reaches any screen that needs them.
  useAppPermissions();
  const { colors } = useTheme();
  return (
    <View style={[styles.shell, { backgroundColor: colors.bg }]}>
      <BrandWatermark variant="subtle" />
      <View style={styles.foreground}>
        <ToastProvider>
          <ConfirmModalHost />
          <AppUpdatePrompt />
          <LoaderProvider>
            <AuthProvider>
              <AuthenticatedEffects />
              <OrgRealtimeProvider>
                <RecordingProvider>
                  <VoiceProvider>
                    <RootNavigator />
                  </VoiceProvider>
                  <RecordingWidget />
                </RecordingProvider>
              </OrgRealtimeProvider>
            </AuthProvider>
          </LoaderProvider>
        </ToastProvider>
      </View>
      <OfflineBanner />
      <StatusBar style={colors.statusBar} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#0a0a0c' },
  foreground: { flex: 1 },
});
