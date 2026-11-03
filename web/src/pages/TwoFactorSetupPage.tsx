import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { copyText } from '../lib/copyText';
import { SesLoader } from '../ui/SesLoader';

function apiError(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg?.toString() || fallback;
}

export function TwoFactorSetupPage() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .setupTwoFactor()
      .then((result) => {
        setSecret(result.secret);
        setQrCodeDataUrl(result.qrCodeDataUrl);
      })
      .catch((err) => {
        setError(apiError(err, 'Could not start setup'));
      })
      .finally(() => setLoading(false));
  }, []);

  async function onEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.enableTwoFactor(code.trim());
      await refreshUser();
      setBackupCodes(result.backupCodes);
    } catch (err) {
      setError(apiError(err, 'Check the code and try again'));
    } finally {
      setBusy(false);
    }
  }

  async function onCopy(value: string) {
    const ok = await copyText(value);
    if (ok) {
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1500);
    }
  }

  if (loading) {
    return <SesLoader label="Loading setup" />;
  }

  if (backupCodes) {
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Two-Factor Enabled</h1>
            <p>Save your backup codes</p>
          </div>
        </div>
        <div className="content profile-page">
          <div className="panel profile-panel">
            <p className="muted" style={{ marginTop: 0 }}>
              Save these backup codes somewhere safe. Each one can be used once
              if you lose your authenticator app — they will not be shown again.
            </p>
            <ul className="backup-code-list">
              {backupCodes.map((backupCode) => (
                <li key={backupCode} className="backup-code-row">
                  <code>{backupCode}</code>
                  <button
                    type="button"
                    className="btn btn-ghost profile-copy"
                    onClick={() => onCopy(backupCode)}
                  >
                    {copied === backupCode ? 'Copied' : 'Copy'}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: 'auto', marginTop: 16 }}
              onClick={() => navigate('/settings')}
            >
              I&apos;ve saved these codes
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Enable 2FA</h1>
          <p>Scan with your authenticator app</p>
        </div>
      </div>
      <div className="content profile-page">
        <div className="panel profile-panel">
          {qrCodeDataUrl ? (
            <img className="twofa-qr" src={qrCodeDataUrl} alt="2FA QR code" />
          ) : null}
          <p className="muted">Can&apos;t scan? Enter this code manually:</p>
          <div className="profile-field-row" style={{ marginBottom: 16 }}>
            <code className="profile-field-value">{secret}</code>
            <button
              type="button"
              className="btn btn-ghost profile-copy"
              onClick={() => onCopy(secret)}
            >
              {copied === secret ? 'Copied' : 'Copy'}
            </button>
          </div>
          <form className="profile-form-grid" onSubmit={onEnable}>
            <div className="field">
              <label htmlFor="twofa-code">Authenticator code</label>
              <input
                id="twofa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            {error ? <p className="error">{error}</p> : null}
            <div className="profile-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy || !code.trim()}
              >
                Enable 2FA
              </button>
              <Link className="btn btn-ghost" to="/settings">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
      {busy ? <SesLoader label="Enabling 2FA" /> : null}
    </>
  );
}
