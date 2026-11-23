import { useEffect, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as announcementsApi from '../api/announcements';
import { useAuth } from '../auth/AuthContext';
import { onAnnouncementsRead } from '../screens/announcements/announcementsBus';
import { goToSection } from './goToSection';
import type { MainStackParamList } from './types';

type MainNav = NativeStackNavigationProp<
  MainStackParamList,
  keyof MainStackParamList
>;

/**
 * Unread announcement count for the drawer badge.
 *
 * Re-read whenever the drawer opens or the route changes — the only moments
 * the badge can actually be seen — plus an event from the Announcements
 * screen the instant it clears the count, so the badge never sits there
 * stale right after someone has read everything.
 *
 * Skipped when the signed-in account has no guild (platform admin, or
 * pre-join): that 404 is expected and must not hit the network every
 * route change just to be swallowed.
 */
export function useUnreadAnnouncements(open: boolean, routeName: string | null) {
  const { org, guild } = useAuth();
  const inAGuild = !!org || !!guild;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!inAGuild) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    announcementsApi
      .getUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      // Someone with no guild yet 404s here; the badge simply stays off.
      .catch(() => {
        if (!cancelled) setUnread(0);
      });
    return () => {
      cancelled = true;
    };
  }, [open, routeName, inAGuild]);

  useEffect(() => onAnnouncementsRead(() => setUnread(0)), []);

  return unread;
}

/**
 * The Announcements row. Shared because the drawer is built in four places
 * (both home screens plus both useAppDrawer hooks) — defining the row once
 * is the only way it stays identical in all of them.
 *
 * An item rather than its own section, so it joins the existing Guild group
 * instead of printing a second "Guild" heading under it.
 */
export function announcementsItem(
  navigation: MainNav,
  home: 'OrgHome' | 'GuildHome',
  unread: number,
) {
  return {
    key: 'announcements',
    label: 'Announcements',
    icon: 'megaphone' as const,
    badge: unread,
    onPress: () => goToSection(navigation, home, { screen: 'Announcements' }),
  };
}
