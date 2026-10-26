import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const apiBaseUrl =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:3000';

export const TOKEN_STORAGE_KEY = 'team-coach/accessToken';

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
});

apiClient.interceptors.request.use(async (requestConfig) => {
  const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});
