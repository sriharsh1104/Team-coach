import { useMemo, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SideDrawerSection } from '../ui/SideDrawer';
import { MainStackParamList } from './types';
import { goToSection } from './goToSection';
import { drawerItemKeyForRoute, withActiveDrawerItem } from './drawerActive';

type MainNav = NativeStackNavigationProp<MainStackParamList, keyof MainStackParamList>;

// Screens pushed directly off OrgHome/GuildHome (Members, Stats, Media, …)
// render a hamburger button that opens this same drawer, so any of them can
// jump straight to another section — see useDrawerHeader below. The
// `navigation` passed in is whichever screen's own nav prop opened the
// drawer; goToSection navigates on that shared MainStack (push/pop) so
// Android back reverses the same path from anywhere.
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
  const { org } = useAuth();
  const isOwner = !!org?.isOwner;
  const { open, navigation, openWith, close, routeName, setRouteName } =
    useDrawerHeader();

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
        key: 'voice',
        label: 'Team Voice',
        icon: 'mic-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Voice' }),
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
            label: 'Team Chat',
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

    if (isOwner) {
      sections.push({
        key: 'guild',
        label: 'Guild',
        split: true,
        items: [
          {
            key: 'guildHome',
            label: 'Guild Roster',
            onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Guild' }),
          },
        ],
      });
    }

    sections.push({
      key: 'account',
      label: 'Account',
      split: true,
      items: [
        {
          key: 'profile',
          label: 'Profile',
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Profile' }),
        },
        {
          key: 'socialHandles',
          label: 'Social Handles',
          onPress: () =>
            goToSection(navigation, 'OrgHome', { screen: 'SocialHandles' }),
        },
      ],
    });

    return withActiveDrawerItem(
      sections,
      drawerItemKeyForRoute(routeName ?? undefined),
    );
  }, [navigation, isOwner, routeName]);

  return { open, sections, openWith, close, setRouteName };
}

// Same sections GuildHomeScreen shows (guild-only members have no org).
export function useGuildDrawer() {
  const { open, navigation, openWith, close, routeName, setRouteName } =
    useDrawerHeader();

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
            onPress: () => goToSection(navigation, 'GuildHome'),
          },
        ],
      },
      {
        key: 'guild',
        label: 'Guild',
        split: true,
        items: [
          {
            key: 'guildHome',
            label: 'Guild Roster',
            onPress: () => goToSection(navigation, 'GuildHome', { screen: 'Guild' }),
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
            onPress: () => goToSection(navigation, 'GuildHome', { screen: 'Profile' }),
          },
          {
            key: 'socialHandles',
            label: 'Social Handles',
            onPress: () =>
              goToSection(navigation, 'GuildHome', { screen: 'SocialHandles' }),
          },
        ],
      },
    ];
    return withActiveDrawerItem(
      base,
      drawerItemKeyForRoute(routeName ?? undefined),
    );
  }, [navigation, routeName]);

  return { open, sections, openWith, close, setRouteName };
}
