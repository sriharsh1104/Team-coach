export function postAuthPath(
  user: { profileComplete: boolean },
  org: { isOwner: boolean } | null,
) {
  if (!user.profileComplete) return '/profile';
  if (org && !org.isOwner) return '/app';
  return '/guild';
}
