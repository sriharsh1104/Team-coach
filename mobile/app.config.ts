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
  slug: 'sacred-esports',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'teamcoach',
  // Avoid a stuck white native splash while JS boots / auth restores.
  splash: {
    backgroundColor: '#0a0a0c',
  },
  backgroundColor: '#0a0a0c',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.teamcoach.app',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Sacred Team Coach needs microphone access for team voice channels.',
      // iOS CRASHES on the spot (and App Review rejects the build) if one of
      // these is missing when the matching API is first called. The app does
      // use all three: camera in voice video, the photo library for avatars /
      // media posts / map screenshots, and the media library for Share Music.
      NSCameraUsageDescription:
        'Sacred Team Coach needs camera access so you can turn on video in voice channels.',
      NSPhotoLibraryUsageDescription:
        'Sacred Team Coach needs photo access so you can set an avatar and post screenshots to your team.',
      NSPhotoLibraryAddUsageDescription:
        'Sacred Team Coach saves screenshots and clips you capture back to your photo library.',
      NSAppleMusicUsageDescription:
        'Sacred Team Coach reads songs on this device so you can share one with your team in voice.',
      // Keep voice alive when the app is backgrounded (gaming sessions).
      UIBackgroundModes: ['audio', 'voip'],
      // Needed so Linking can prefer Instagram / Discord / YouTube / etc. apps
      // over the browser when a social handle is tapped.
      LSApplicationQueriesSchemes: [
        'instagram',
        'whatsapp',
        'discord',
        'youtube',
        'vnd.youtube',
        'tg',
        'telegram',
        'mailto',
      ],
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
    // From Firebase Console → Project settings → Your apps → Android.
    // Download google-services.json into mobile/ (see FIREBASE-PUSH-SETUP.md).
    googleServicesFile: existsSync('./google-services.json')
      ? './google-services.json'
      : undefined,
    permissions: [
      'RECORD_AUDIO',
      'MODIFY_AUDIO_SETTINGS',
      'POST_NOTIFICATIONS',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MEDIA_PROJECTION',
      // Keeps the voice-channel mic alive when the app is backgrounded.
      'FOREGROUND_SERVICE_MICROPHONE',
      'WAKE_LOCK',
      // In-app APK updates: lets the downloaded update open Android's installer.
      'REQUEST_INSTALL_PACKAGES',
      'CAMERA',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
      // Android 13 split storage into per-type permissions. Share Music lists
      // audio files, so without this the music picker's permission request
      // can never be granted on Android 13+ — it just comes back denied.
      'READ_MEDIA_AUDIO',
      'ACTIVITY_RECOGNITION',
      'SCHEDULE_EXACT_ALARM',
      'USE_EXACT_ALARM',
      'RECEIVE_BOOT_COMPLETED',
      'VIBRATE',
      'USE_FULL_SCREEN_INTENT',
    ],
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
    // Screen share in voice needs the MediaProjection foreground service
    // (Android 14+). No extra LiveKit secrets — only this native flag.
    [
      '@livekit/react-native-expo-plugin',
      {
        android: {
          audioType: 'communication',
          enableScreenShareService: true,
        },
      },
    ],
    '@config-plugins/react-native-webrtc',
    [
      'expo-local-authentication',
      {
        // iOS refuses Face ID outright without this string in Info.plist —
        // unlike Touch ID, which needs no permission description at all. That
        // asymmetry is exactly why biometric login could work in testing on
        // an older Touch ID iPhone and silently fail on any Face ID device.
        faceIDPermission:
          'Sacred Team Coach uses Face ID to unlock the app with biometric login.',
      },
    ],
    'expo-secure-store',
    'react-native-compressor',
    '@react-native-google-signin/google-signin',
    [
      'expo-notifications',
      {
        // Android status-bar / tray icon must be a white silhouette on
        // transparent — monochrome adaptive asset fits that requirement.
        // Takes effect after a native rebuild (EAS / prebuild), not Expo Go.
        icon: './assets/android-icon-monochrome.png',
        color: '#c9ccd1',
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission:
          'Sacred Team Coach saves recorded videos into your phone gallery.',
        savePhotosPermission:
          'Sacred Team Coach saves recorded videos into your phone gallery.',
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission:
          'Sacred Team Coach needs camera access to take chat photos and record video.',
        photosPermission:
          'Sacred Team Coach needs photo library access to share media in chat.',
        microphonePermission:
          'Sacred Team Coach needs microphone access when recording video.',
      },
    ],
    ['./plugins/withApkFileName', { name: 'SacredTeamCoach' }],
    './plugins/withSocialPackageQueries',
    // Voice changer: hooks modules/voice-changer into react-native-webrtc's
    // capture path from MainApplication.onCreate (see mobile/VOICE-CHANGER.md).
    './plugins/withVoiceChanger',
    // Patch ExpoModulesCorePlugin.gradle: double-afterEvaluate to fix
    // "Could not get unknown property 'release' for SoftwareComponent container"
    // with Gradle 8.x + expo-modules-core <=2.2.3 (Expo SDK 52).
    './plugins/withPatchExpoModulesCore',
    // Health Connect permissions / rationale (Tracker Health). The RN package
    // itself is a normal dependency; this local plugin avoids requiring its
    // config-plugin entry at `expo config` time.
    './plugins/withHealthConnect',
  ],
  extra: {
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
    appEnv,
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    // Set after `eas init` / first EAS build — required for Expo push tokens
    // on standalone APKs (Expo Go can work without it).
    eas: {
      projectId:
        process.env.EAS_PROJECT_ID ?? '63a5440b-4571-420c-bf7b-93a651f57e27',
    },
  },
  owner: process.env.EAS_OWNER ?? 'sacredesportss',
};

export default expoConfig;
