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
  name: 'Team Coach',
  slug: 'team-coach',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'teamcoach',
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
    appEnv,
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
  },
};

export default expoConfig;
