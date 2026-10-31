import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function TwoFactorPage() {
  const { completeTwoFactorLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as {
    challengeToken?: string;
    next?: string;
  };
  const challengeToken = state.challengeToken;
  const nextPath = state.next || '/app';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!challengeToken) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="auth-sub">No 2FA challenge. Sign in again.</p>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setBusy(true);
    setError(null);
    try {
      await completeTwoFactorLogin(challengeToken, { code: code.trim() });
      navigate(nextPath);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Invalid code',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="brand">Two-factor</h1>
        <p className="auth-sub">Enter the code from your authenticator app.</p>
        <div className="field">
          <label htmlFor="code">Code</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Continue
        </button>
      </form>
    </div>
  );
}
