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
  // expo-font plugin (app.config.ts) pre-bundles Ionicons.ttf as a native
  // Android asset — useFonts loads it from there (fast, no network).
  // We do NOT block rendering so there is never a blank screen on cold start.
  useFonts({ ...Ionicons.font });

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
