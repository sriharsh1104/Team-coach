import { useMemo, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SideDrawerSection } from '../ui/SideDrawer';
import { MainStackParamList } from './types';
import { goToSection } from './goToSection';
import {
  announcementsItem,
  useUnreadAnnouncements,
} from './announcementsDrawerItem';
import { achievementsItem } from './achievementsDrawerItem';
import { trackerDrawerSection } from './trackerDrawerItems';
import { drawerItemKeyForRoute, withActiveDrawerItem } from './drawerActive';

type MainNav = NativeStackNavigationProp<MainStackParamList, keyof MainStackParamList>;

function useDrawerHeader() {
  const [open, setOpen] = useState(false);
  const [navigation, setNavigation] = useState<MainNav | null>(null);
  // Set from RootNavigator's NavigationContainer onStateChange — these hooks
  // live *outside* the container, so useNavigationState() cannot be used here.
  const [routeName, setRouteName] = useState<string | null>(null);

  return {
    open,
    navigation,
    routeName,
    setRouteName,
    openWith: (nav: MainNav) => {
      setNavigation(nav);
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}

// Same sections OrgHomeScreen shows, minus its canInviteRoster coach check
// (that needs an extra org-detail fetch OrgHome already has loaded — not
// worth re-fetching on every secondary screen just to decide whether to
// show one Guild link). Non-owner coaches with roster-invite rights simply
// don't get the Guild shortcut from secondary screens; they still have it
// from OrgHome itself.
export function useOrgDrawer() {
  const { org, user } = useAuth();
  const isOwner = !!org?.isOwner;
  // Display only — /admin is authorised server-side on every request.
  const isAdmin = !!user?.isPlatformAdmin;
  const { open, navigation, openWith, close, routeName, setRouteName } =
    useDrawerHeader();
  const unreadAnnouncements = useUnreadAnnouncements(open, routeName);

  const sections = useMemo((): SideDrawerSection[] => {
    if (!navigation) return [];
    const arenaItems = [
      {
        key: 'members',
        label: 'Roster',
        icon: 'people-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Members' }),
      },
      {
        key: 'media',
        label: 'Media',
        icon: 'images-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'MediaFeed' }),
      },
      {
        key: 'stats',
        label: 'Stats & Schedule',
        icon: 'bar-chart-outline' as const,
        onPress: () =>
          goToSection(navigation, 'OrgHome', {
            screen: 'Stats',
            params: { mode: 'BR' },
          }),
      },
      {
        key: 'maps',
        label: 'Maps',
        icon: 'map-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Maps' }),
      },
      {
        key: 'ruleBook',
        label: 'Rule Book',
        icon: 'book-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'RuleBook' }),
      },
      {
        key: 'pointsTable',
        label: 'Points Table',
        icon: 'trophy-outline' as const,
        onPress: () =>
          goToSection(navigation, 'OrgHome', { screen: 'PointsTable' }),
      },
      ...(isOwner
        ? [
            {
              key: 'orgSettings',
              label: 'Org Settings',
              icon: 'settings-outline' as const,
              onPress: () =>
                goToSection(navigation, 'OrgHome', { screen: 'OrgSettings' }),
            },
          ]
        : []),
    ];

    const sections: SideDrawerSection[] = [
      {
        key: 'chat',
        label: 'Chat',
        items: [
          {
            key: 'teamChat',
            label: 'Chat',
            icon: 'chatbubble-outline' as const,
            onPress: () => goToSection(navigation, 'OrgHome'),
          },
        ],
      },
      {
        key: 'arena',
        label: 'Esports Arena',
        split: true,
        items: arenaItems,
      },
    ];

    // Everyone gets the Guild section: every member can see the roster and
    // the join-request queue, and play Games from here. GuildScreen itself
    // decides who additionally gets the accept/add/remove controls (owner,
    // coach, or guild leadership) — this link just gets everyone *in*.
    sections.push({
      key: 'guild',
      label: 'Guild',
      split: true,
      items: [
        announcementsItem(navigation, 'OrgHome', unreadAnnouncements),
        achievementsItem(navigation, 'OrgHome'),
        {
          key: 'guildHome',
          label: 'Guild Roster',
          icon: 'people-outline' as const,
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Guild' }),
        },
        {
          key: 'games',
          label: 'Games',
          icon: 'game-controller-outline' as const,
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Games' }),
        },
      ],
    });

    sections.push({
      key: 'live',
      label: 'Live',
      split: true,
      items: [
        {
          key: 'goLive',
          label: 'Go Live',
          icon: 'play' as const,
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'GoLive' }),
        },
      ],
    });

    sections.push(trackerDrawerSection(navigation, 'OrgHome'));

    sections.push({
      key: 'account',
      label: 'Account',
      split: true,
      items: [
        {
          key: 'profile',
          label: 'Profile',
          icon: 'person-outline' as const,
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Profile' }),
        },
        {
          key: 'socialHandles',
          label: 'Social Handles',
          icon: 'share-social-outline' as const,
          onPress: () =>
            goToSection(navigation, 'OrgHome', { screen: 'SocialHandles' }),
        },
      ],
    });

    if (isAdmin) {
      sections.push({
        key: 'platform',
        label: 'Platform',
        split: true,
        items: [
          {
            key: 'admin',
            label: 'Admin',
            icon: 'shield-outline' as const,
            onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Admin' }),
          },
        ],
      });
    }

    return withActiveDrawerItem(
      sections,
      drawerItemKeyForRoute(routeName ?? undefined),
    );
  }, [
    navigation,
    isOwner,
    isAdmin,
    routeName,
    unreadAnnouncements,
  ]);

  return { open, sections, openWith, close, setRouteName };
}

// Same sections GuildHomeScreen shows (guild-only members have no org).
export function useGuildDrawer() {
  const { user } = useAuth();
  const isAdmin = !!user?.isPlatformAdmin;
  const { open, navigation, openWith, close, routeName, setRouteName } =
    useDrawerHeader();
  const unreadAnnouncements = useUnreadAnnouncements(open, routeName);

  const sections = useMemo((): SideDrawerSection[] => {
    if (!navigation) return [];
    const base: SideDrawerSection[] = [
      {
        key: 'chat',
        label: 'Chat',
        items: [
          {
            key: 'guildChat',
            label: 'Guild Chat',
            icon: 'chatbubble-outline' as const,
            onPress: () => goToSection(navigation, 'GuildHome'),
          },
        ],
      },
      {
        key: 'guild',
        label: 'Guild',
        split: true,
        items: [
          announcementsItem(navigation, 'GuildHome', unreadAnnouncements),
          achievementsItem(navigation, 'GuildHome'),
          {
            key: 'guildHome',
            label: 'Guild Roster',
            icon: 'people-outline' as const,
            onPress: () => goToSection(navigation, 'GuildHome', { screen: 'Guild' }),
          },
          {
            key: 'games',
            label: 'Games',
            icon: 'game-controller-outline' as const,
            onPress: () => goToSection(navigation, 'GuildHome', { screen: 'Games' }),
          },
        ],
      },
      {
        key: 'live',
        label: 'Live',
        split: true,
        items: [
          {
            key: 'goLive',
            label: 'Go Live',
            icon: 'play' as const,
            onPress: () => goToSection(navigation, 'GuildHome', { screen: 'GoLive' }),
          },
        ],
      },
      trackerDrawerSection(navigation, 'GuildHome'),
      {
        key: 'account',
        label: 'Account',
        split: true,
        items: [
          {
            key: 'profile',
            label: 'Profile',
            icon: 'person-outline' as const,
            onPress: () => goToSection(navigation, 'GuildHome', { screen: 'Profile' }),
          },
          {
            key: 'socialHandles',
            label: 'Social Handles',
            icon: 'share-social-outline' as const,
            onPress: () =>
              goToSection(navigation, 'GuildHome', { screen: 'SocialHandles' }),
          },
        ],
      },
    ];
    if (isAdmin) {
      base.push({
        key: 'platform',
        label: 'Platform',
        split: true,
        items: [
          {
            key: 'admin',
            label: 'Admin',
            icon: 'shield-outline' as const,
            onPress: () => goToSection(navigation, 'GuildHome', { screen: 'Admin' }),
          },
        ],
      });
    }
    return withActiveDrawerItem(
      base,
      drawerItemKeyForRoute(routeName ?? undefined),
    );
  }, [navigation, isAdmin, routeName, unreadAnnouncements]);

  return { open, sections, openWith, close, setRouteName };
}

/**
 * Drawer for a platform admin who has no guild of their own.
 *
 * Without this the admin-only stack had no hamburger and no settings gear at
 * all — no way to change theme, reach Security, or even log out, because
 * every other route to those lives behind an org or guild the admin does not
 * have. Deliberately short: this account exists to run the platform, not to
 * play on it.
 */
export function useAdminDrawer() {
  const { open, navigation, openWith, close, routeName, setRouteName } =
    useDrawerHeader();

  const sections = useMemo((): SideDrawerSection[] => {
    if (!navigation) return [];
    return withActiveDrawerItem(
      [
        {
          key: 'platform',
          label: 'Platform',
          items: [
            {
              key: 'admin',
              label: 'Dashboard',
              icon: 'shield-outline' as const,
              // Plain navigate, not goToSection: this stack's initial route
              // is Admin itself — there is no OrgHome/GuildHome under it.
              onPress: () => navigation.navigate('Admin'),
            },
          ],
        },
        {
          key: 'account',
          label: 'Account',
          split: true,
          items: [
            {
              key: 'profile',
              label: 'Profile',
              icon: 'person-outline' as const,
              onPress: () => navigation.navigate('Profile'),
            },
            {
              key: 'settings',
              label: 'Settings',
              icon: 'settings-outline' as const,
              onPress: () => navigation.navigate('Settings'),
            },
          ],
        },
      ],
      drawerItemKeyForRoute(routeName ?? undefined),
    );
  }, [navigation, routeName]);

  return { open, sections, openWith, close, setRouteName };
}
