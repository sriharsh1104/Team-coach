import { apiClient } from './client';
import { Profile } from './types';

export function getMyProfile() {
  return apiClient.get<Profile>('/users/me').then((res) => res.data);
}

export function getMemberProfile(userId: string) {
  return apiClient
    .get<Profile>(`/users/${userId}/profile`)
    .then((res) => res.data);
}
