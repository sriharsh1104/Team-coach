import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Could not join';
}

/**
 * /join/:token — shareable invite + QR target.
 * New users: stash token → signup/login → profile → auto-join as PLAYER on roster.
 * Existing users with no other org: join immediately after auth.
 */
export function InviteJoinPage() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = extractInviteToken(rawToken || '');
  const { isLoading, user, org, setOrg, setGuild } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('This invite link is missing a code.');
      return;
    }
    savePendingInvite(token);

    if (isLoading) return;

    if (!user) {
      navigate(`/signup?invite=${encodeURIComponent(token)}`, { replace: true });
      return;
    }

    if (!user.profileComplete) {
      navigate('/profile', { replace: true });
      return;
    }

    if (org) {
      clearPendingInvite();
      navigate(postAuthPath(user, org), { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
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
    isLoading,
    user,
    org,
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
            <Link to={token ? inviteJoinPath(token) : '/signup'}>Try again</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {(isLoading || busy || !user) && (
        <SesLoader label={busy ? 'Joining team' : 'Opening invite'} />
      )}
    </>
  );
}
