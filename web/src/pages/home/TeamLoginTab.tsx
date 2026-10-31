import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

/**
 * Website tab for Sacred roster only — after login they land on in-app
 * tournament records (players, coaches, owners).
 */
export function TeamLoginTab() {
  const { login, user, org } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user && org) {
    return (
      <section className="landing-section landing-tab-panel team-login-panel">
        <h2>Team login</h2>
        <p className="landing-section-lead">
          You&apos;re signed in as {user.name}. Open tournament records for the
          roster.
        </p>
        <button
          type="button"
          className="landing-cta"
          onClick={() => navigate('/app/tournament-records')}
        >
          View tournament records
        </button>
      </section>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const challenge = await login(email.trim(), password);
      if (challenge && 'requiresTwoFactor' in challenge) {
        navigate('/2fa', {
          state: {
            challengeToken: challenge.challengeToken,
            next: '/app/tournament-records',
          },
        });
        return;
      }
      navigate('/app/tournament-records');
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
    <section className="landing-section landing-tab-panel team-login-panel">
      <h2>Team login</h2>
      <p className="landing-section-lead">
        Sacred players, coaches, and owners — sign in to view tournament
        records. Coaches and owners can also update them.
      </p>

      <form className="team-login-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="team-email">Email</label>
          <input
            id="team-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="team-password">Password</label>
          <input
            id="team-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="landing-cta" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in to Records'}
        </button>
      </form>
    </section>
  );
}
