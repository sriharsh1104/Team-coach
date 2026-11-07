import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { SesLoader } from '../ui/SesLoader';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      navigate('/reset-password', { state: { email: email.trim() } });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Something went wrong',
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
        <h2 className="auth-title">Forgot password</h2>
        <p className="auth-sub">
          Enter your account email and we&apos;ll send you a code to reset your
          password.
        </p>

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

        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Send code
        </button>

        <p className="auth-footer">
          <Link to="/signin">← Back to log in</Link>
        </p>
      </form>
      {busy ? <SesLoader label="Sending code" /> : null}
    </div>
  );
}
