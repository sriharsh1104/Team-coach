import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { beginLoader, endLoader } from '../ui/loaderBus';
import { emitToast } from '../ui/toastBus';
import { getToken, TOKEN_STORAGE_KEY } from '../storage/tokenStorage';
import { apiErrorMessage } from './apiErrorMessage';

type RequestConfigWithFlags = InternalAxiosRequestConfig & {
  /** Set true to skip the global API-error toaster (e.g. silent /auth/me). */
  skipErrorToast?: boolean;
  /** Set true to skip the global SES loader overlay. */
  skipLoader?: boolean;
  __loaderStarted?: boolean;
};

function requestUrl(cfg?: RequestConfigWithFlags): string {
  return `${cfg?.baseURL ?? ''}${cfg?.url ?? ''}`;
}

function shouldSkipErrorToast(error: AxiosError): boolean {
  const cfg = error.config as RequestConfigWithFlags | undefined;
  if (cfg?.skipErrorToast) return true;
  // Bootstrapping session refresh — don't spam the UI on cold start / 401.
  if (requestUrl(cfg).includes('/auth/me')) return true;
  return false;
}

function shouldSkipLoader(cfg?: RequestConfigWithFlags): boolean {
  if (cfg?.skipLoader) return true;
  // Quiet background polls / session restore.
  if (requestUrl(cfg).includes('/auth/me')) return true;
  // GETs while navigating screens used to flash the full-screen SES loader
  // on every tap — skip them; mutations still show the delayed overlay.
  const method = (cfg?.method ?? 'get').toLowerCase();
  if (method === 'get' || method === 'head') return true;
  return false;
}

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
  // Physical devices hanging on a bad host (e.g. localhost baked into an APK
  // when .env.production was gitignored) used to leave cold start stuck forever.
  timeout: 15000,
});

apiClient.interceptors.request.use(async (requestConfig) => {
  const cfg = requestConfig as RequestConfigWithFlags;
  const token = await getToken();
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  if (!shouldSkipLoader(cfg)) {
    beginLoader();
    cfg.__loaderStarted = true;
  }
  return cfg;
});

apiClient.interceptors.response.use(
  (response) => {
    const cfg = response.config as RequestConfigWithFlags;
    if (cfg.__loaderStarted) endLoader();
    return response;
  },
  (error: AxiosError) => {
    const cfg = error.config as RequestConfigWithFlags | undefined;
    if (cfg?.__loaderStarted) endLoader();
    if (!shouldSkipErrorToast(error)) {
      emitToast(apiErrorMessage(error));
    }
    return Promise.reject(error);
  },
);
