import { useEffect, useRef } from 'react';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { confirmAsync } from '../ui/confirmAsync';
import { emitToast } from '../ui/toastBus';
import { takePendingInvite, usePendingInvite } from './inviteLinks';

/**
 * Renders nothing. Mounted once the user is inside the app (guild or org
 * stack). People with no guild/org are handled by JoinOrgScreen instead, which
 * joins straight away.
 *
 *  - guild member + roster link  → "Join the roster?" Yes/No, then join as Player
 *  - guild member + guild link   → already in a guild
 *  - already on a roster         → nothing to join
 */
export function InviteLinkBridge() {
  const invite = usePendingInvite();
  const { org, setOrg, setGuild, refreshOrg } = useAuth();
  const busy = useRef(false);

  useEffect(() => {
    if (!invite || busy.current) return;
    busy.current = true;
    const current = takePendingInvite();
    if (!current) {
      busy.current = false;
      return;
    }

    void (async () => {
      try {
        if (org) {
          emitToast('You are already on a roster');
          return;
        }
        if (current.seat !== 'roster') {
          emitToast('You are already in a guild');
          return;
        }
        const ok = await confirmAsync(
          'Join the roster?',
          'You were invited to join the esports roster as a Player.',
          'Yes',
          'No',
          false,
        );
        if (!ok) return;
        const joined = await orgApi.joinOrg({ referralToken: current.token });
        setOrg({
          id: joined.id,
          name: joined.name,
          role: joined.myRole,
          isOwner: joined.isOwner,
        });
        setGuild({ id: joined.id, name: joined.name, role: 'MEMBER' });
        await refreshOrg();
        emitToast(`Joined ${joined.name} roster`);
      } catch {
        // API message is shown by the global axios → toaster interceptor.
      } finally {
        busy.current = false;
      }
    })();
  }, [invite, org, setOrg, setGuild, refreshOrg]);

  return null;
}
