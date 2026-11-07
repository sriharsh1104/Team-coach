import { apiClient } from './client';
import { Device, Profile, UpdateProfileInput } from './types';
import { appendFileToFormData } from './uploadFile';

export function getMyProfile() {
  return apiClient.get<Profile>('/users/me').then((res) => res.data);
}

export function updateMyProfile(input: UpdateProfileInput) {
  return apiClient.patch<Profile>('/users/me', input).then((res) => res.data);
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
  const form = new FormData();
  await appendFileToFormData(form, {
    uri: file.uri,
    name: file.fileName,
    type: file.mimeType,
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
