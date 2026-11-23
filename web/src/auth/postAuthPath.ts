import { inviteJoinPath, peekPendingInvite } from './invitePending';

export function postAuthPath(
  user: { profileComplete: boolean; isPlatformAdmin?: boolean },
  org: { isOwner: boolean } | null,
) {
  const invite = peekPendingInvite();
  if (invite) {
    if (!user.profileComplete) return '/profile';
    return inviteJoinPath(invite.token, invite.invitedByUserId, invite.seat);
  }
  // A platform admin is here to run the platform, not to play on it: no
  // in-game name, no guild to join. Sending them through the player
  // onboarding was asking for details the admin screens never use. The
  // invite case above still wins — an admin who clicked an invite link
  // meant to join that guild.
  if (user.isPlatformAdmin) return '/admin';
  if (!user.profileComplete) return '/profile';
  if (org && !org.isOwner) return '/app';
  return '/guild';
}
