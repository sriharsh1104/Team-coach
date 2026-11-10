import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
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

// Notification handler is registered lazily after login (see registerPushToken)
// so a missing notifications native module cannot crash cold start.
// LiveKit/WebRTC globals register only when Voice opens — same reason.

function AppShell() {
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
                  <RootNavigator />
                  {/* Floating widget — rendered above all screens when recording */}
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
  // Load Ionicons font before rendering — prevents invisible icon glyphs in
  // EAS/production builds where the font file isn't yet cached by the runtime.
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  // Keep showing nothing (splash is still visible) until fonts are ready.
  if (!fontsLoaded) return null;

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
  shell: { flex: 1 },
  foreground: { flex: 1 },
});
