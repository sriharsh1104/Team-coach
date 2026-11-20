import { apiClient } from './client';
import { Device, Profile, UpdateProfileInput } from './types';
import { appendFileToFormData } from './uploadFile';
import { compressForUpload } from '../media/compressForUpload';

export function getMyProfile() {
  return apiClient.get<Profile>('/users/me').then((res) => res.data);
}

export function updateMyProfile(input: UpdateProfileInput) {
  return apiClient.patch<Profile>('/users/me', input).then((res) => res.data);
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
  return apiClient.patch('/users/me/push-token', { token });
}

export function getMemberProfile(userId: string) {
  return apiClient
    .get<Profile>(`/users/${userId}/profile`)
    .then((res) => res.data);
}
