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
  // Block rendering until Ionicons.ttf is ready — icons are guaranteed visible
  // on first frame. expo-font plugin pre-bundles the .ttf natively so this
  // completes in < 300 ms. If loading fails (fontError), we proceed anyway
  // so the app still opens. Returning a dark View (not null) during load
  // prevents the white flash / "black screen" perception.
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font });
  if (!fontsLoaded && !fontError) {
    return <View style={styles.shell} />;
  }

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
  // Default bg matches the black theme — shown for < 300 ms during font load.
  shell: { flex: 1, backgroundColor: '#0a0a0c' },
  foreground: { flex: 1 },
});
