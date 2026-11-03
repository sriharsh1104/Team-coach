import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { PasswordField } from '../auth/PasswordField';
import { useAuth } from '../auth/AuthContext';
import { BookStage, useBookTabs } from '../ui/BookTabs';
import { SesLoader } from '../ui/SesLoader';

type Tab = 'password' | 'twoFactor';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'password', label: 'Password' },
  { id: 'twoFactor', label: '2FA' },
];
const TAB_IDS = TABS.map((t) => t.id);

function apiError(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg?.toString() || fallback;
}

export function SecurityPage() {
  const { user, applyAuthResponse, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { tab, openTab, turn } = useBookTabs(TAB_IDS, 'password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorInfo, setTwoFactorInfo] = useState<string | null>(null);

  if (!user) return null;
  // Narrowed local — nested render helpers don't keep the null check.
  const me = user;

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordInfo(null);
    try {
      const response = await authApi.changePassword(currentPassword, newPassword);
      await applyAuthResponse(response);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordInfo('Password changed.');
    } catch (err) {
      setPasswordError(apiError(err, 'Could not change password'));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function onDisableTwoFactor(e: FormEvent) {
    e.preventDefault();
    setDisableBusy(true);
    setTwoFactorError(null);
    setTwoFactorInfo(null);
    try {
      await authApi.disableTwoFactor(disablePassword);
      await refreshUser();
      setShowDisableForm(false);
      setDisablePassword('');
      setTwoFactorInfo('Two-factor authentication disabled.');
    } catch (err) {
      setTwoFactorError(apiError(err, 'Could not disable 2FA'));
    } finally {
      setDisableBusy(false);
    }
  }

  function renderTab(active: string) {
    if (active === 'password') {
      return (
        <div>
          <h2 className="profile-section-title">Change Password</h2>
          {!me.hasPassword ? (
            <p className="muted">
              This account signs in with Google and has no password to change.
            </p>
          ) : (
            <form className="profile-form-grid" onSubmit={onChangePassword}>
              <PasswordField
                id="sec-current"
                label="Current password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                required
              />
              <PasswordField
                id="sec-new"
                label="New password"
                autoComplete="new-password"
                value={newPassword}
                onChange={setNewPassword}
                minLength={8}
                required
              />
              <PasswordField
                id="sec-confirm"
                label="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                minLength={8}
                required
              />
              {passwordError ? <p className="error">{passwordError}</p> : null}
              {passwordInfo ? <p className="muted">{passwordInfo}</p> : null}
              <div className="profile-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={
                    passwordBusy ||
                    !currentPassword ||
                    newPassword.length < 8 ||
                    newPassword !== confirmPassword
                  }
                >
                  Update Password
                </button>
              </div>
            </form>
          )}
        </div>
      );
    }

    return (
      <div>
        <h2 className="profile-section-title">Two-Factor Authentication</h2>
        <p className="muted">
          Uses Google Authenticator (or any TOTP-compatible app).
        </p>
        <p className={`security-status${me.twoFactorEnabled ? ' on' : ''}`}>
          {me.twoFactorEnabled
            ? 'Enabled — code required at login'
            : 'Disabled — add an extra layer'}
        </p>
        {twoFactorError ? <p className="error">{twoFactorError}</p> : null}
        {twoFactorInfo ? <p className="muted">{twoFactorInfo}</p> : null}

        {me.twoFactorEnabled ? (
          showDisableForm ? (
            <form className="profile-form-grid" onSubmit={onDisableTwoFactor}>
              <PasswordField
                id="sec-disable"
                label="Your password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={setDisablePassword}
                required
              />
              <div className="profile-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={disableBusy || !disablePassword}
                >
                  Confirm Disable
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowDisableForm(false);
                    setDisablePassword('');
                    setTwoFactorError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: 'var(--danger)' }}
              onClick={() => setShowDisableForm(true)}
            >
              Disable 2FA
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: 'auto' }}
            onClick={() => navigate('/settings/2fa')}
          >
            Enable 2FA
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Security</h1>
          <p>Password and two-factor authentication</p>
        </div>
      </div>
      <div className="content profile-page">
        <nav className="pill-switch" aria-label="Security sections" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`pill-switch-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => openTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <BookStage
          tab={tab}
          turn={turn}
          className="panel profile-panel book-profile-panel security-panel"
        >
          {(active) => renderTab(active)}
        </BookStage>

        <p className="auth-footer">
          <Link to="/profile">Back to profile</Link>
        </p>
      </div>
      {passwordBusy ? <SesLoader label="Updating password" /> : null}
      {disableBusy ? <SesLoader label="Disabling 2FA" /> : null}
    </>
  );
}
