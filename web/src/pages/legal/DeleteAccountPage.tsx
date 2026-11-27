import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as usersApi from '../../api/users';
import { PasswordField } from '../../auth/PasswordField';
import { useAuth } from '../../auth/AuthContext';
import { LegalDocLayout } from './LegalDocLayout';

const CONTACT_EMAIL = 'sacredesportsss@gmail.com';
const DELETE_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  'Sacred Team Coach — Account deletion request',
)}&body=${encodeURIComponent(
  'Please delete my Sacred Team Coach account and associated personal data.\n\nAccount email: \n\nI confirm I want permanent deletion.\n',
)}`;

function apiError(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg?.toString() || fallback;
}

/**
 * Google Play requires a public web URL where users can request account
 * deletion outside the app. Logged-in users can delete here; others can
 * email support or sign in first.
 */
export function DeleteAccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasPassword = !!user?.hasPassword;
  const canSubmit =
    confirmEmail.trim().length > 3 &&
    (!hasPassword || password.trim().length >= 8);

  async function onDelete(e: FormEvent) {
    e.preventDefault();
    if (!user || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await usersApi.deleteMyAccount({
        confirmEmail: confirmEmail.trim(),
        ...(hasPassword ? { password } : {}),
      });
      setDone(true);
      await logout();
    } catch (err) {
      setError(apiError(err, 'Could not delete account'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LegalDocLayout title="Delete Account" updated="27 November 2026">
      <p>
        Sacred Team Coach lets you permanently delete your account and
        associated personal data. Temporary deactivation is not the same as
        deletion.
      </p>

      <h2>Option 1 — In the Mobile App</h2>
      <ol>
        <li>Open Sacred Team Coach and sign in</li>
        <li>Go to Settings → Account Settings → Delete Or Deactivate</li>
        <li>Choose Delete Account and confirm with your email (and password if
          you have one)</li>
      </ol>

      <h2>Option 2 — On This Website</h2>
      {done ? (
        <p className="legal-ok" role="status">
          Your account has been deleted. You can close this page.
        </p>
      ) : user ? (
        <form
          className="legal-delete-form"
          method="post"
          action="/delete-account"
          aria-labelledby="delete-form-heading"
          onSubmit={onDelete}
        >
          <h3 id="delete-form-heading">Delete Signed-In Account</h3>
          <p>
            Signed in as <strong>{user.email}</strong>. Type your email exactly
            to confirm. If you own a team, transfer ownership or delete the
            team first.
          </p>
          <div className="field">
            <label htmlFor="delete-confirm-email">
              Confirm email <span aria-hidden="true">*</span>
            </label>
            <input
              id="delete-confirm-email"
              name="confirmEmail"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'delete-error' : 'delete-email-help'}
            />
            <span id="delete-email-help" className="hint">
              Must match {user.email}
            </span>
          </div>
          {hasPassword ? (
            <PasswordField
              id="delete-password"
              label="Password *"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
              minLength={8}
            />
          ) : (
            <p className="hint">
              Google sign-in accounts confirm with email only.
            </p>
          )}
          {error ? (
            <p id="delete-error" className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="btn btn-danger"
            type="submit"
            disabled={busy || !canSubmit}
            style={{ width: '100%', marginTop: 4 }}
          >
            {busy ? 'Deleting…' : 'Permanently Delete Account'}
          </button>
        </form>
      ) : (
        <p>
          <Link to="/signin">Sign in</Link> on this site, then return here to
          delete your account, or use Option 3 below.
        </p>
      )}

      <h2>Option 3 — Email Request</h2>
      <p>
        If you cannot sign in, email us from your account address:{' '}
        <a href={DELETE_MAILTO}>{CONTACT_EMAIL}</a>. Include the email on the
        account and that you want permanent deletion. We process requests as
        soon as reasonably possible (typically within a few days).
      </p>

      <h2>What Gets Deleted</h2>
      <p>
        Account profile, personal settings, and associated personal data in our
        primary systems. Limited security / legal logs may be retained for a
        short period where required. See the{' '}
        <Link to="/privacy">Privacy Policy</Link> for details.
      </p>

      {!done && user ? (
        <p className="legal-footnote">
          <button
            type="button"
            className="linkish"
            onClick={() => {
              void logout().then(() => navigate('/'));
            }}
          >
            Sign out instead
          </button>
        </p>
      ) : null}
    </LegalDocLayout>
  );
}
