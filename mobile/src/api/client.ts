import axios from 'axios';
import Constants from 'expo-constants';
import { getToken, TOKEN_STORAGE_KEY } from '../storage/tokenStorage';

export const apiBaseUrl =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:3000';

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
