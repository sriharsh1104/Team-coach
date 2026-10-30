import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getToken, TOKEN_STORAGE_KEY } from '../storage/tokenStorage';

function resolveApiBaseUrl(): string {
  const configured =
    (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
    'http://localhost:3000';
  // `.env.development` uses 10.0.2.2 for the Android emulator. That address
  // is unreachable from Chrome / Expo web on the laptop — rewrite to localhost
  // so `npm start` → press `w` still hits the Nest API.
  if (Platform.OS === 'web' && configured.includes('10.0.2.2')) {
    return configured.replace('10.0.2.2', 'localhost');
  }
  return configured;
}

export const apiBaseUrl = resolveApiBaseUrl();

/** Absolute CDN URLs (Cloudinary) stay as-is; relative API paths get the host. */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${apiBaseUrl}${url}`;
}

// Re-exported so existing imports (tests, screens) keep working.
export { TOKEN_STORAGE_KEY };

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
});

apiClient.interceptors.request.use(async (requestConfig) => {
  const token = await getToken();
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});
