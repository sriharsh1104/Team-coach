import { apiClient } from './client';
import { Device, Profile, UpdateProfileInput } from './types';

export function getMyProfile() {
  return apiClient.get<Profile>('/users/me').then((res) => res.data);
}

export function updateMyProfile(input: UpdateProfileInput) {
  return apiClient.patch<Profile>('/users/me', input).then((res) => res.data);
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
