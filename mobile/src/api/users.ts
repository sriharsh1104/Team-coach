import { ApiRequestConfig, apiClient } from './client';
import {
  Device,
  GameProfileVisibilityInput,
  Profile,
  UpdateProfileInput,
  UpsertGameProfileInput,
} from './types';
import { appendFileToFormData } from './uploadFile';
import { compressForUpload } from '../media/compressForUpload';

export function getMyProfile() {
  return apiClient.get<Profile>('/users/me').then((res) => res.data);
}

export function updateMyProfile(input: UpdateProfileInput) {
  return apiClient.patch<Profile>('/users/me', input).then((res) => res.data);
}

export function upsertGameProfile(input: UpsertGameProfileInput) {
  return apiClient
    .put<Profile>('/users/me/game-profiles', input)
    .then((res) => res.data);
}

export function setGameProfileVisibility(input: GameProfileVisibilityInput) {
  return apiClient
    .patch<Profile>('/users/me/game-profiles/visibility', input)
    .then((res) => res.data);
}

export function removeGameProfile(game: string) {
  return apiClient
    .delete<Profile>(`/users/me/game-profiles/${encodeURIComponent(game)}`)
    .then((res) => res.data);
}

export function deactivateMyAccount(input: {
  confirmEmail: string;
  password?: string;
}) {
  return apiClient
    .post<{ ok: true }>('/users/me/deactivate', input)
    .then((res) => res.data);
}

export function deleteMyAccount(input: {
  confirmEmail: string;
  password?: string;
}) {
  return apiClient
    .post<{ ok: true }>('/users/me/delete', input)
    .then((res) => res.data);
}

/**
 * Step 1: send the typed number, get a one-time Telegram bot link. The phone is
 * saved only after the user shares the matching contact in the bot AND types
 * the 6-digit code the bot sends back (see confirmTelegramPhoneCode).
 */
export function startTelegramPhoneVerification(phone: string) {
  return apiClient
    .post<{ deepLink: string; expiresAt: string }>('/users/me/phone/telegram', {
      phone,
    })
    .then((res) => res.data);
}

/** Step 3: the code the bot sent to the user's Telegram chat. */
export function confirmTelegramPhoneCode(code: string) {
  return apiClient
    .post<{ phone: string }>('/users/me/phone/telegram/verify', { code })
    .then((res) => res.data);
}

function stripMultipartContentType(data: unknown, headers?: unknown) {
  if (headers && typeof headers === 'object') {
    delete (headers as Record<string, unknown>)['Content-Type'];
    delete (headers as Record<string, unknown>)['content-type'];
  }
  return data;
}

export async function uploadMyAvatar(file: {
  uri: string;
  fileName: string;
  mimeType: string;
}) {
  // Same content:// → file:// pass as chat media / group photo uploads.
  const prepared = await compressForUpload(file);
  const form = new FormData();
  await appendFileToFormData(form, {
    uri: prepared.uri,
    name: prepared.fileName,
    type: prepared.mimeType,
  });
  return apiClient
    .post<Profile>('/users/me/avatar', form, {
      timeout: 60_000,
      transformRequest: stripMultipartContentType,
    })
    .then((res) => res.data);
}

export function addDevice(name: string, model: string) {
  return apiClient
    .post<Device>('/users/me/devices', { name, model })
    .then((res) => res.data);
}

export function removeDevice(deviceId: string) {
  return apiClient.delete(`/users/me/devices/${deviceId}`);
}

export function setPushToken(token: string) {
  // A background/foreground cycle re-registers this on its own (see
  // registerPushToken.ts) — if one slips through right around logout, a 401
  // here is expected, not something the user needs an "Unauthorized" toast
  // about.
  return apiClient.patch('/users/me/push-token', { token }, {
    skipErrorToast: true,
    skipLoader: true,
  } as ApiRequestConfig);
}

/** Drop this device's Expo token from the signed-in user (logout). */
export function clearPushToken(token: string) {
  return apiClient.delete('/users/me/push-token', {
    data: { token },
    skipErrorToast: true,
    skipLoader: true,
  } as ApiRequestConfig);
}

export function getMemberProfile(userId: string) {
  return apiClient
    .get<Profile>(`/users/${userId}/profile`)
    .then((res) => res.data);
}
