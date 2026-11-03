import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordField } from '../auth/PasswordField';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const challenge = await login(email.trim(), password);
      if (challenge && 'requiresEmailVerification' in challenge) {
        navigate('/verify-email', {
          state: { challengeToken: challenge.challengeToken, email },
        });
        return;
      }
      if (challenge && 'requiresTwoFactor' in challenge) {
        navigate('/2fa', { state: { challengeToken: challenge.challengeToken } });
        return;
      }
      navigate('/app');
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
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-footer">
          New here? <Link to="/signup">Create an account</Link>
          <br />
          <Link to="/">← Back to Sacred home</Link>
        </p>
      </form>
    </div>
  );
}
