import { apiClient } from './client';
import { AuthResponse, AuthUser, OrgSummary, LoginResult, SignupResult } from './types';

// A brand-new signup is never usable immediately — it comes back as an
// email-verification challenge instead of a session (see verifyEmailSignup).
export function signup(email: string, password: string, name: string) {
  return apiClient
    .post<SignupResult>('/auth/signup', { email, password, name })
    .then((res) => res.data);
}

export function verifyEmailSignup(challengeToken: string, code: string) {
  return apiClient
    .post<AuthResponse>('/auth/verify-email', { challengeToken, code })
    .then((res) => res.data);
}

export function resendEmailVerification(challengeToken: string) {
  return apiClient
    .post<{ success: boolean }>('/auth/resend-verification', { challengeToken })
    .then((res) => res.data);
}

export function login(email: string, password: string) {
  return apiClient
    .post<LoginResult>('/auth/login', { email, password })
    .then((res) => res.data);
}

export function googleLogin(idToken: string) {
  return apiClient
    .post<LoginResult>('/auth/google', { idToken })
    .then((res) => res.data);
}

export function verifyTwoFactor(
  challengeToken: string,
  payload: { code?: string; backupCode?: string },
) {
  return apiClient
    .post<AuthResponse>('/auth/2fa/verify', { challengeToken, ...payload })
    .then((res) => res.data);
}

export function me() {
  return apiClient
    .get<AuthUser & { org: OrgSummary | null }>('/auth/me')
    .then((res) => res.data);
}

export function logout() {
  return apiClient.post('/auth/logout').then(() => undefined);
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiClient
    .patch<AuthResponse>('/auth/password', { currentPassword, newPassword })
    .then((res) => res.data);
}

export function setupTwoFactor() {
  return apiClient
    .post<{ secret: string; qrCodeDataUrl: string }>('/auth/2fa/setup')
    .then((res) => res.data);
}

export function enableTwoFactor(code: string) {
  return apiClient
    .post<{ backupCodes: string[] }>('/auth/2fa/enable', { code })
    .then((res) => res.data);
}

export function disableTwoFactor(password: string) {
  return apiClient
    .post('/auth/2fa/disable', { password })
    .then(() => undefined);
}
