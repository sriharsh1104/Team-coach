import 'dotenv/config';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { ExpoConfig } from 'expo/config';

// APP_ENV picks which .env.<APP_ENV> file to load (development by default).
// e.g. APP_ENV=stage npm start
const appEnv = process.env.APP_ENV ?? 'development';
const envFile = `.env.${appEnv}`;
if (existsSync(envFile)) {
  config({ path: envFile, override: true });
}

// `npm run web` sets this after the env file loads. Chrome on the laptop
// must call http://localhost:3000. The Android emulator address in
// .env.development (10.0.2.2) is not reachable from the browser.
if (process.env.WEB_API_BASE_URL) {
  process.env.API_BASE_URL = process.env.WEB_API_BASE_URL;
}

const expoConfig: ExpoConfig = {
  name: 'Sacred Team Coach',
  slug: 'team-coach',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'teamcoach',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.teamcoach.app',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Sacred Team Coach needs microphone access for team voice channels.',
    },
  },
  android: {
    package: 'com.teamcoach.app',
    adaptiveIcon: {
      // Solid black only — foreground is the Sacred emblem with transparent
      // background so Android's circular/squircle mask doesn't show a nested
      // black square plate behind the logo.
      backgroundColor: '#000000',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS'],
    // Lets the OS shrink the window when the keyboard opens (this is
    // actually Expo's own default when unset — set explicitly so it's not
    // left to an SDK default to document/rely on). ChatScreen's
    // KeyboardAvoidingView only has a real `behavior` on iOS; on Android the
    // window resize is what keeps the message input above the keyboard.
    softwareKeyboardLayoutMode: 'resize',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    '@react-native-community/datetimepicker',
    '@livekit/react-native-expo-plugin',
    'expo-secure-store',
    'react-native-compressor',
  ],
  extra: {
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
    appEnv,
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
  },
};

export default expoConfig;
