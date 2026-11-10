import React from 'react';
import { View, Text } from 'react-native';
import { useSharedStyles } from '../shared';
import { useTheme } from '../../theme/ThemeContext';

// Metro picks this file automatically when bundling for web (the .web.tsx
// extension wins over the plain .tsx for this import path). It deliberately
// never imports '@livekit/react-native-webrtc' or 'mediasoup-client' —
// both throw at import time when their native module isn't present, which
// would crash the entire app bundle on web, not just this screen.
export function VoiceChannelScreen() {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  return (
    <View style={shared.container}>
      <Text style={shared.title}>Team Voice</Text>
      <Text style={{ textAlign: 'center', color: colors.textMuted }}>
        Voice channels need the native Android/iOS app — they're not available in this
        web preview.
      </Text>
    </View>
  );
}
