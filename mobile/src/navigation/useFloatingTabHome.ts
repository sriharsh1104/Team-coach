import { useAuth } from '../auth/AuthContext';

/** Which home stack the floating tab bar should target. */
export function useFloatingTabHome(): 'OrgHome' | 'GuildHome' {
  const { org } = useAuth();
  return org ? 'OrgHome' : 'GuildHome';
}
