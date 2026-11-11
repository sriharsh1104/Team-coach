import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
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

// Keep native splash visible while fonts load — prevents any black screen.
SplashScreen.preventAutoHideAsync();

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
                  {/* Floating recording status pill — appears above all screens */}
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
  const [fontsLoaded, fontError] = Font.useFonts(Ionicons.font);

  // Hide the native splash screen once fonts are ready (or failed).
  // This is the official Expo pattern — splash stays until fonts load,
  // so there is never a blank/black frame.
  const onLayout = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Also hide via effect in case onLayout fires before fonts finish.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // While fonts are loading the native splash screen is still showing —
  // returning null here is fine because users see the splash, not a black screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={styles.shell} onLayout={onLayout}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  foreground: { flex: 1 },
});
