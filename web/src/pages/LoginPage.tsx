import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PasswordField } from '../auth/PasswordField';
import { useAuth } from '../auth/AuthContext';
import { extractInviteToken, savePendingInvite } from '../auth/invitePending';
import { postAuthPath } from '../auth/postAuthPath';
import { SesLoader } from '../ui/SesLoader';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const invite = extractInviteToken(searchParams.get('invite') || '');
    const ref = searchParams.get('ref')?.trim() || undefined;
    const seat =
      searchParams.get('seat') === 'roster' ? ('roster' as const) : undefined;
    if (invite) savePendingInvite(invite, ref, seat);
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const challenge = await login(email.trim(), password);
      if ('requiresEmailVerification' in challenge) {
        navigate('/verify-email', {
          state: { challengeToken: challenge.challengeToken, email },
        });
        return;
      }
      if ('requiresTwoFactor' in challenge) {
        navigate('/2fa', { state: { challengeToken: challenge.challengeToken } });
        return;
      }
      navigate(postAuthPath(challenge.user, challenge.org));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Login failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="brand-watermark auth" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="brand">
          Sacred <span>Esports</span>
        </h1>
        <h2 className="auth-title">Log in</h2>
        <p className="auth-sub">Sign in to your team workspace on the web.</p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />

        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Sign in
        </button>

        <p className="auth-footer">
          New here? <Link to="/signup">Create an account</Link>
          <br />
          <Link to="/">← Back to Sacred home</Link>
        </p>
      </form>
      {busy ? <SesLoader label="Signing in" /> : null}
    </div>
  );
}
