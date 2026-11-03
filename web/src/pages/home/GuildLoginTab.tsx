import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleSignInButton } from '../../auth/GoogleSignInButton';
import { PasswordField } from '../../auth/PasswordField';
import { useAuth } from '../../auth/AuthContext';
import { postAuthPath } from '../../auth/postAuthPath';
import { SesLoader } from '../../ui/SesLoader';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const GUILD_HOME = '/guild';

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

export function GuildLoginTab() {
  const { login, signup, loginWithGoogle, user, org } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <div className="guild-login-card">
        <p className="landing-section-lead">
          You&apos;re signed in as {user.name}. Guild membership stays separate
          from the esports roster.
        </p>
        <button
          type="button"
          className="landing-cta"
          onClick={() => navigate(org && !org.isOwner ? '/app' : GUILD_HOME)}
        >
          {org && !org.isOwner ? 'Open team' : 'Open guild'}
        </button>
      </div>
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
        if ('requiresEmailVerification' in challenge) {
          navigate('/verify-email', {
            state: {
              challengeToken: challenge.challengeToken,
              email,
              next: GUILD_HOME,
            },
          });
          return;
        }
        navigate(postAuthPath(challenge.user, challenge.org));
        return;
      }

      const challenge = await login(email.trim(), password);
      if ('requiresEmailVerification' in challenge) {
        navigate('/verify-email', {
          state: {
            challengeToken: challenge.challengeToken,
            email,
            next: GUILD_HOME,
          },
        });
        return;
      }
      if ('requiresTwoFactor' in challenge) {
        navigate('/2fa', {
          state: { challengeToken: challenge.challengeToken, next: GUILD_HOME },
        });
        return;
      }
      navigate(postAuthPath(challenge.user, challenge.org));
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
      if ('requiresTwoFactor' in challenge) {
        navigate('/2fa', {
          state: { challengeToken: challenge.challengeToken, next: GUILD_HOME },
        });
        return;
      }
      navigate(postAuthPath(challenge.user, challenge.org));
    } catch (err: unknown) {
      setError(errorMessage(err, 'Google sign-in failed'));
    } finally {
      setBusy(false);
    }
  }

  const signingUp = mode === 'signup';

  return (
    <div className="guild-login-card">
      <div className="auth-mode" role="tablist" aria-label="Account">
        <span
          className={`auth-mode-pill${signingUp ? ' signup' : ''}`}
          aria-hidden="true"
        />
        <button
          type="button"
          role="tab"
          id="auth-tab-login"
          aria-selected={!signingUp}
          aria-controls="auth-panel"
          className={signingUp ? '' : 'active'}
          onClick={() => switchMode('login')}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          id="auth-tab-signup"
          aria-selected={signingUp}
          aria-controls="auth-panel"
          className={signingUp ? 'active' : ''}
          onClick={() => switchMode('signup')}
        >
          Sign up
        </button>
      </div>

      <div
        key={mode}
        id="auth-panel"
        role="tabpanel"
        aria-labelledby={signingUp ? 'auth-tab-signup' : 'auth-tab-login'}
        className="auth-mode-copy"
      >
        <h2>{signingUp ? 'Create your account' : 'Welcome back'}</h2>
        <p className="landing-section-lead">
          {signingUp
            ? 'Then join a guild with its org code, or start a new org.'
            : 'Sign in to your guild. This does not add you to the esports roster.'}
        </p>
      </div>

      <form className="team-login-form" onSubmit={onSubmit}>
        <div
          className={`auth-extra${signingUp ? ' open' : ''}`}
          aria-hidden={!signingUp}
        >
          <div className="auth-extra-inner">
            <div className="field">
              <label htmlFor="guild-name">Name</label>
              <input
                id="guild-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={signingUp}
                tabIndex={signingUp ? 0 : -1}
              />
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="guild-email">Email</label>
          <input
            id="guild-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <PasswordField
          id="guild-password"
          label="Password"
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          value={password}
          onChange={setPassword}
          required
        />
        <div
          className={`auth-extra${signingUp ? ' open' : ''}`}
          aria-hidden={!signingUp}
        >
          <div className="auth-extra-inner">
            <p className="team-password-hint">
              At least 8 characters, with an uppercase letter, a lowercase
              letter, a number, and a special character.
            </p>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="landing-cta" type="submit" disabled={busy}>
          {signingUp ? 'Create account' : 'Sign in'}
        </button>

        <p className="team-auth-or">or</p>
        <GoogleSignInButton
          disabled={busy}
          onCredential={onGoogle}
          onError={setError}
        />
      </form>
      {busy ? (
        <SesLoader label={signingUp ? 'Creating account' : 'Signing in'} />
      ) : null}
    </div>
  );
}
