import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export const apiBaseUrl =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:3000';

export const TOKEN_STORAGE_KEY = 'team-coach/accessToken';

// The access token specifically goes in SecureStore (Android Keystore /
// iOS Keychain), not AsyncStorage — AsyncStorage is unencrypted on-device
// storage, fine for non-sensitive state but not for a bearer credential.
export const apiClient = axios.create({
  baseURL: apiBaseUrl,
});

apiClient.interceptors.request.use(async (requestConfig) => {
  const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});
