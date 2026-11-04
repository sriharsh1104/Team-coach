import { inviteJoinPath, peekPendingInvite } from './invitePending';

export function postAuthPath(
  user: { profileComplete: boolean },
  org: { isOwner: boolean } | null,
) {
  const invite = peekPendingInvite();
  if (invite) {
    if (!user.profileComplete) return '/profile';
    return inviteJoinPath(invite.token, invite.invitedByUserId, invite.seat);
  }
  if (!user.profileComplete) return '/profile';
  if (org && !org.isOwner) return '/app';
  return '/guild';
}
