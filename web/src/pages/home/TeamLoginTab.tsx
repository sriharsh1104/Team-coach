import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleSignInButton } from '../../auth/GoogleSignInButton';
import { PasswordField } from '../../auth/PasswordField';
import { useAuth } from '../../auth/AuthContext';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const RECORDS = '/app/tournament-records';

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

/**
 * Website tab for Sacred roster only — after login they land on in-app
 * tournament records (players, coaches, owners).
 */
export function TeamLoginTab() {
  const { login, signup, loginWithGoogle, user, org } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user && org) {
    return (
      <section className="landing-section landing-tab-panel team-login-panel">
        <p className="landing-section-lead">
          You&apos;re signed in as {user.name}. Open tournament records for the
          roster.
        </p>
        <button
          type="button"
          className="landing-cta"
          onClick={() => navigate(RECORDS)}
        >
          View tournament records
        </button>
      </section>
    );
  }

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && !PASSWORD_REGEX.test(password)) {
      setError(
        'Password needs at least 8 characters, with an uppercase letter, a lowercase letter, a number, and a special character.',
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const challenge = await signup(email.trim(), password, name.trim());
        if (challenge && 'requiresEmailVerification' in challenge) {
          navigate('/verify-email', {
            state: { challengeToken: challenge.challengeToken, email },
          });
          return;
        }
      } else {
        const challenge = await login(email.trim(), password);
        if (challenge && 'requiresTwoFactor' in challenge) {
          navigate('/2fa', {
            state: { challengeToken: challenge.challengeToken, next: RECORDS },
          });
          return;
        }
      }
      navigate(RECORDS);
    } catch (err: unknown) {
      setError(
        errorMessage(err, mode === 'signup' ? 'Signup failed' : 'Login failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle(idToken: string) {
    setError(null);
    setBusy(true);
    try {
      const challenge = await loginWithGoogle(idToken);
      if (challenge && 'requiresTwoFactor' in challenge) {
        navigate('/2fa', {
          state: { challengeToken: challenge.challengeToken, next: RECORDS },
        });
        return;
      }
      navigate(RECORDS);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Google sign-in failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="landing-section landing-tab-panel team-login-panel">
      <h2>{mode === 'signup' ? 'Sign up' : 'Log in'}</h2>
      <p className="landing-section-lead">
        {mode === 'signup'
          ? 'Create a Sacred account, then open tournament records.'
          : 'Sacred players, coaches, and owners — sign in to view tournament records. Coaches and owners can also update them.'}
      </p>

      <form className="team-login-form" onSubmit={onSubmit}>
        {mode === 'signup' ? (
          <div className="field">
            <label htmlFor="team-name">Name</label>
            <input
              id="team-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        ) : null}
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
        <PasswordField
          id="team-password"
          label="Password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={setPassword}
          required
        />
        {mode === 'signup' ? (
          <p className="team-password-hint">
            At least 8 characters, with an uppercase letter, a lowercase letter,
            a number, and a special character.
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="landing-cta" type="submit" disabled={busy}>
          {busy
            ? mode === 'signup'
              ? 'Creating…'
              : 'Signing in…'
            : mode === 'signup'
              ? 'Create account'
              : 'Sign in to Records'}
        </button>

        <p className="team-auth-or">or</p>
        <GoogleSignInButton
          disabled={busy}
          onCredential={onGoogle}
          onError={setError}
        />
      </form>

      <p className="team-auth-switch">
        {mode === 'login' ? (
          <>
            New here?{' '}
            <button type="button" onClick={() => switchMode('signup')}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('login')}>
              Log in
            </button>
          </>
        )}
      </p>
    </section>
  );
}
