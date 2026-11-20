import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import {
  clearPendingInvite,
  extractInviteToken,
  inviteJoinPath,
  savePendingInvite,
} from '../auth/invitePending';
import { postAuthPath } from '../auth/postAuthPath';
import { SesLoader } from '../ui/SesLoader';

const APP_PACKAGE = 'com.teamcoach.app';
const APP_SCHEME = 'teamcoach';

function isAndroidBrowser() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** Link that opens the installed Android app straight on this invite. */
function appInviteLink(token: string, seat: 'guild' | 'roster', ref?: string) {
  const qs = new URLSearchParams();
  if (seat === 'roster') qs.set('seat', 'roster');
  if (ref) qs.set('ref', ref);
  const query = qs.toString();
  return `intent://join/${encodeURIComponent(token)}${
    query ? `?${query}` : ''
  }#Intent;scheme=${APP_SCHEME};package=${APP_PACKAGE};end`;
}

function errorMessage(err: unknown) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg)
    ? msg.join(', ')
    : msg?.toString() || 'Could not join';
}

/**
 * /join/:token — shareable invite + QR target.
 * Default: guild only. `?seat=roster` (owner/coach share link) joins guild +
 * esports roster as Player.
 */
export function InviteJoinPage() {
  const { token: rawToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const token = extractInviteToken(rawToken || '');
  const invitedByUserId = searchParams.get('ref')?.trim() || undefined;
  const seat =
    searchParams.get('seat') === 'roster' ? ('roster' as const) : ('guild' as const);
  const { isLoading, user, org, guild, setOrg, setGuild } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // On Android, offer the app first (it joins in one tap). "Continue in
  // browser" or ?web=1 falls back to the normal web flow below.
  const [webMode, setWebMode] = useState(
    () => !isAndroidBrowser() || searchParams.get('web') === '1',
  );
  const appLink = token ? appInviteLink(token, seat, invitedByUserId) : '';

  useEffect(() => {
    if (webMode || !appLink) return;
    const t = window.setTimeout(() => {
      window.location.href = appLink;
    }, 200);
    return () => window.clearTimeout(t);
  }, [webMode, appLink]);

  useEffect(() => {
    if (!webMode) return;
    if (!token) {
      setError('This invite link is missing a code.');
      return;
    }
    savePendingInvite(token, invitedByUserId, seat);

    if (isLoading) return;

    if (!user) {
      // Signup lives on the home page's Guild tab now (route: /signin), not
      // a standalone /signup page — ?invite=... there flips it to signup mode.
      const qs = new URLSearchParams({ invite: token });
      if (invitedByUserId) qs.set('ref', invitedByUserId);
      if (seat === 'roster') qs.set('seat', 'roster');
      navigate(`/signin?${qs.toString()}`, { replace: true });
      return;
    }

    if (!user.profileComplete) {
      navigate('/profile', { replace: true });
      return;
    }

    if (org || (seat === 'guild' && guild)) {
      clearPendingInvite();
      navigate(postAuthPath(user, org), { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        if (seat === 'roster') {
          const joined = await orgApi.joinOrg({ referralToken: token });
          if (cancelled) return;
          setOrg({
            id: joined.id,
            name: joined.name,
            role: joined.myRole,
            isOwner: joined.isOwner,
          });
          setGuild({ id: joined.id, name: joined.name, role: 'MEMBER' });
          clearPendingInvite();
          navigate('/app', { replace: true });
        } else {
          const joined = await orgApi.joinGuild({
            referralToken: token,
            invitedByUserId,
          });
          if (cancelled) return;
          setGuild({ id: joined.id, name: joined.name, role: joined.role });
          clearPendingInvite();
          navigate('/guild', { replace: true });
        }
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
        clearPendingInvite();
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    webMode,
    token,
    invitedByUserId,
    seat,
    isLoading,
    user,
    org,
    guild,
    navigate,
    setOrg,
    setGuild,
  ]);

  if (!webMode && token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="brand">Invite</h1>
          <p>
            {seat === 'roster'
              ? 'You were invited to join the esports roster.'
              : 'You were invited to join a guild.'}
          </p>
          <a className="btn btn-primary" href={appLink}>
            Open in the app
          </a>
          <p className="auth-footer">
            App not installed?
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setWebMode(true)}
          >
            Continue in browser
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="brand">Invite</h1>
          <p className="error">{error}</p>
          <p className="auth-footer">
            <Link to="/">Back home</Link>
            {' · '}
            <Link to={token ? inviteJoinPath(token, invitedByUserId, seat) : '/signin'}>
              Try again
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {(isLoading || busy || !user) && (
        <SesLoader
          label={
            busy
              ? seat === 'roster'
                ? 'Joining roster'
                : 'Joining guild'
              : 'Opening invite'
          }
        />
      )}
    </>
  );
}
