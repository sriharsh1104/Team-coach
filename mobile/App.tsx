import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { BrandWatermark } from './src/brand/BrandWatermark';
import { RootNavigator } from './src/navigation/RootNavigator';
import { OrgRealtimeProvider } from './src/realtime/OrgRealtimeProvider';
import { AppErrorBoundary } from './src/ui/AppErrorBoundary';
import { LoaderProvider } from './src/ui/SesLoader';
import { ToastProvider } from './src/ui/Toast';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RecordingProvider } from './src/recording/RecordingContext';
import { RecordingWidget } from './src/recording/RecordingWidget';
import { useAppPermissions } from './src/hooks/useAppPermissions';
import { useServerWakePing } from './src/hooks/useServerWakePing';
import { LatencyProvider } from './src/perf/LatencyContext';
import { LatencyBadge } from './src/ui/LatencyBadge';
import { VoiceProvider } from './src/voice/VoiceContext';
import { VoiceFloatingWidget } from './src/voice/VoiceFloatingWidget';

function AppShell() {
  // Request notification + microphone permissions once on app start,
  // before the user reaches any screen that needs them.
  useAppPermissions();
  // Keep the Render.com backend alive — pings /health every 10 minutes while
  // the user is logged in so the free-tier server doesn't spin down.
  useServerWakePing();
  const { colors } = useTheme();
  return (
    <View style={[styles.shell, { backgroundColor: colors.bg }]}>
      <BrandWatermark variant="subtle" />
      <View style={styles.foreground}>
        <ToastProvider>
          <LoaderProvider>
            <AuthProvider>
              <OrgRealtimeProvider>
                <RecordingProvider>
                  <VoiceProvider>
                    <LatencyProvider>
                      <RootNavigator />
                      <LatencyBadge />
                      <VoiceFloatingWidget />
                    </LatencyProvider>
                  </VoiceProvider>
                  <RecordingWidget />
                </RecordingProvider>
              </OrgRealtimeProvider>
            </AuthProvider>
          </LoaderProvider>
        </ToastProvider>
      </View>
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
