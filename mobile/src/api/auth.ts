import { apiClient } from './client';
import { AuthResponse, AuthUser, OrgSummary } from './types';

export function signup(email: string, password: string, name: string) {
  return apiClient
    .post<AuthResponse>('/auth/signup', { email, password, name })
    .then((res) => res.data);
}

export function login(email: string, password: string) {
  return apiClient
    .post<AuthResponse>('/auth/login', { email, password })
    .then((res) => res.data);
}

export function googleLogin(idToken: string) {
  return apiClient
    .post<AuthResponse>('/auth/google', { idToken })
    .then((res) => res.data);
}

export function me() {
  return apiClient
    .get<AuthUser & { org: OrgSummary | null }>('/auth/me')
    .then((res) => res.data);
}
