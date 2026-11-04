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

  useEffect(() => {
    if (!token) {
      setError('This invite link is missing a code.');
      return;
    }
    savePendingInvite(token, invitedByUserId, seat);

    if (isLoading) return;

    if (!user) {
      const qs = new URLSearchParams({ invite: token });
      if (invitedByUserId) qs.set('ref', invitedByUserId);
      if (seat === 'roster') qs.set('seat', 'roster');
      navigate(`/signup?${qs.toString()}`, { replace: true });
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

  if (error) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="brand">Invite</h1>
          <p className="error">{error}</p>
          <p className="auth-footer">
            <Link to="/">Back home</Link>
            {' · '}
            <Link to={token ? inviteJoinPath(token, invitedByUserId, seat) : '/signup'}>
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
