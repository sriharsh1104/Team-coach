import { apiClient } from './client';
import {
  AuthResponse,
  AuthUser,
  GuildSummary,
  OrgSummary,
  LoginResult,
  SignupResult,
} from './types';

/**
 * First contact with the backend, so these are the calls that pay for a
 * cold start on the free tier — the default 15s client timeout would fail
 * before the server had even finished booting.
 */
const COLD_START_TIMEOUT_MS = 60_000;

// A brand-new signup is never usable immediately — it comes back as an
// email-verification challenge instead of a session (see verifyEmailSignup).
export function signup(email: string, password: string, name: string) {
  return apiClient
    .post<SignupResult>(
      '/auth/signup',
      { email, password, name },
      { timeout: COLD_START_TIMEOUT_MS },
    )
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
    .post<LoginResult>(
      '/auth/login',
      { email, password },
      { timeout: COLD_START_TIMEOUT_MS },
    )
    .then((res) => res.data);
}

export function forgotPassword(email: string) {
  return apiClient
    .post<{ success: boolean }>('/auth/forgot-password', { email })
    .then((res) => res.data);
}

export function resetPassword(email: string, code: string, newPassword: string) {
  return apiClient
    .post<{ success: boolean }>('/auth/reset-password', {
      email,
      code,
      newPassword,
    })
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
    .get<AuthUser & { org: OrgSummary | null; guild: GuildSummary | null }>(
      '/auth/me',
    )
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

export function emailGeneratedPassword() {
  return apiClient
    .post<{ success: boolean; email: string }>('/auth/email-password')
    .then((res) => res.data);
}

export function setupTwoFactor(password: string) {
  return apiClient
    .post<{ secret: string; qrCodeDataUrl: string }>('/auth/2fa/setup', { password })
    .then((res) => res.data);
}

export function enableTwoFactor(code: string, password: string) {
  return apiClient
    .post<{ backupCodes: string[] }>('/auth/2fa/enable', { code, password })
    .then((res) => res.data);
}

export function disableTwoFactor(password: string) {
  return apiClient
    .post('/auth/2fa/disable', { password })
    .then(() => undefined);
}

export type AuthSessionRow = {
  id: string;
  deviceName: string | null;
  platform: string | null;
  ip: string | null;
  trusted: boolean;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export function listSessions() {
  return apiClient
    .get<{ sessions: AuthSessionRow[] }>('/auth/sessions')
    .then((res) => res.data.sessions);
}

export function revokeSession(sessionId: string) {
  return apiClient
    .delete<{ success: boolean }>(`/auth/sessions/${sessionId}`)
    .then((res) => res.data);
}

export function revokeOtherSessions() {
  return apiClient
    .delete<{ success: boolean; revoked: number }>('/auth/sessions')
    .then((res) => res.data);
}

export function setSessionTrust(sessionId: string, trusted: boolean) {
  return apiClient
    .patch<{ id: string; trusted: boolean }>(
      `/auth/sessions/${sessionId}/trust`,
      { trusted },
    )
    .then((res) => res.data);
}

export type RecoveryEmailState = {
  recoveryEmail: string | null;
  verified: boolean;
  verifiedAt: string | null;
};

export function getRecoveryEmail() {
  return apiClient
    .get<RecoveryEmailState>('/auth/recovery-email')
    .then((res) => res.data);
}

export function requestRecoveryEmail(email: string) {
  return apiClient
    .post<{ success: boolean; email: string }>('/auth/recovery-email', {
      email,
    })
    .then((res) => res.data);
}

export function verifyRecoveryEmail(code: string) {
  return apiClient
    .post<RecoveryEmailState>('/auth/recovery-email/verify', { code })
    .then((res) => res.data);
}

export function clearRecoveryEmail() {
  return apiClient
    .delete<{ success: boolean }>('/auth/recovery-email')
    .then((res) => res.data);
}
