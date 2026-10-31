import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function VerifyEmailPage() {
  const { completeEmailVerification, resendEmailVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as {
    challengeToken?: string;
    email?: string;
  };
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!state.challengeToken) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="auth-sub">No verification session. Start from signup.</p>
          <Link to="/signup">Back to signup</Link>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await completeEmailVerification(state.challengeToken!, code.trim());
      navigate('/app');
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
        <h1 className="brand">Verify email</h1>
        <p className="auth-sub">
          Enter the code sent to {state.email ?? 'your email'}.
        </p>
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
        {info ? <p className="muted">{info}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Verify
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            setInfo(null);
            try {
              await resendEmailVerification(state.challengeToken!);
              setInfo('Code resent.');
            } catch {
              setError('Could not resend code');
            }
          }}
        >
          Resend code
        </button>
      </form>
    </div>
  );
}
