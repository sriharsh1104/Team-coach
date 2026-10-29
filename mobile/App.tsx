import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { BrandWatermark } from './src/brand/BrandWatermark';
import { RootNavigator } from './src/navigation/RootNavigator';
import { OrgRealtimeProvider } from './src/realtime/OrgRealtimeProvider';
import { colors } from './src/theme';

// Needed by both voice paths (self-hosted mediasoup-client and hosted
// LiveKit) — neither can create a WebRTC connection without it. Native only:
// @livekit/react-native-webrtc has no web implementation.
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.shell}>
        <BrandWatermark variant="subtle" />
        <View style={styles.foreground}>
          <AuthProvider>
            <OrgRealtimeProvider>
              <RootNavigator />
            </OrgRealtimeProvider>
          </AuthProvider>
        </View>
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  foreground: { flex: 1 },
});
