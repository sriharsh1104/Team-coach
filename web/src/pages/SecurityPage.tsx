import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { PasswordField } from '../auth/PasswordField';
import { useAuth } from '../auth/AuthContext';
import { FadeSwap } from '../ui/FadeSwap';
import { SesLoader } from '../ui/SesLoader';

type Tab = 'password' | 'twoFactor';

function apiError(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg?.toString() || fallback;
}

export function SecurityPage() {
  const { user, applyAuthResponse, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('password');
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

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Security</h1>
          <p>Password and two-factor authentication</p>
        </div>
      </div>
      <div className="content profile-page">
        <nav className="profile-tabs" aria-label="Security sections">
          <button
            type="button"
            className={`profile-tab${tab === 'password' ? ' active' : ''}`}
            onClick={() => setTab('password')}
          >
            Password
          </button>
          <button
            type="button"
            className={`profile-tab${tab === 'twoFactor' ? ' active' : ''}`}
            onClick={() => setTab('twoFactor')}
          >
            2FA
          </button>
        </nav>

        <FadeSwap contentKey={tab} className="panel profile-panel">
          {tab === 'password' ? (
            <div>
              <h2 className="profile-section-title">Change Password</h2>
              {!user.hasPassword ? (
                <p className="muted">
                  This account signs in with Google and has no password to
                  change.
                </p>
              ) : (
                <form className="profile-form-grid" onSubmit={onChangePassword}>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Use at least 8 characters. You&apos;ll stay signed in after
                    updating.
                  </p>
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
          ) : null}

          {tab === 'twoFactor' ? (
            <div>
              <h2 className="profile-section-title">
                Two-Factor Authentication
              </h2>
              <p className="muted">
                Uses Google Authenticator (or any TOTP-compatible app).
              </p>
              <p
                className={`security-status${user.twoFactorEnabled ? ' on' : ''}`}
              >
                {user.twoFactorEnabled
                  ? 'Enabled — code required at login'
                  : 'Disabled — add an extra layer'}
              </p>
              {twoFactorError ? <p className="error">{twoFactorError}</p> : null}
              {twoFactorInfo ? <p className="muted">{twoFactorInfo}</p> : null}

              {user.twoFactorEnabled ? (
                showDisableForm ? (
                  <form
                    className="profile-form-grid"
                    onSubmit={onDisableTwoFactor}
                  >
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
          ) : null}
        </FadeSwap>

        <p className="auth-footer">
          <Link to="/profile">Back to profile</Link>
        </p>
      </div>
      {passwordBusy ? <SesLoader label="Updating password" /> : null}
      {disableBusy ? <SesLoader label="Disabling 2FA" /> : null}
    </>
  );
}
