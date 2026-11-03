import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PasswordField } from '../auth/PasswordField';
import { useAuth } from '../auth/AuthContext';
import { extractInviteToken, savePendingInvite } from '../auth/invitePending';
import { postAuthPath } from '../auth/postAuthPath';
import { SesLoader } from '../ui/SesLoader';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const invite = extractInviteToken(searchParams.get('invite') || '');
    if (invite) savePendingInvite(invite);
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const challenge = await signup(email.trim(), password, name.trim());
      if (challenge && 'requiresEmailVerification' in challenge) {
        navigate('/verify-email', {
          state: { challengeToken: challenge.challengeToken, email },
        });
        return;
      }
      navigate(postAuthPath(challenge.user, challenge.org));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Signup failed',
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
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="brand">
          Sacred <span>Esports</span>
        </h1>
        <h2 className="auth-title">Sign up</h2>
        <p className="auth-sub">Create your account — same backend as the mobile app.</p>

        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
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
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          minLength={8}
          required
        />

        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Create account
        </button>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link
            to={
              searchParams.get('invite')
                ? `/login?invite=${encodeURIComponent(searchParams.get('invite')!)}`
                : '/login'
            }
          >
            Sign in
          </Link>
        </p>
      </form>
      {busy ? <SesLoader label="Creating account" /> : null}
    </div>
  );
}
