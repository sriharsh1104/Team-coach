import { useMemo, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SideDrawerSection } from '../ui/SideDrawer';
import { MainStackParamList } from './types';
import { goToSection } from './goToSection';

type MainNav = NativeStackNavigationProp<MainStackParamList, keyof MainStackParamList>;

// Screens pushed directly off OrgHome/GuildHome (Members, Stats, Media, …)
// render a hamburger button that opens this same drawer, so any of them can
// jump straight to another section — see useDrawerHeader below. The
// `navigation` passed in is whichever screen's own nav prop opened the
// drawer; goToSection resets that shared MainStack regardless of which
// screen instance triggered it, so this works the same from anywhere.
function useDrawerHeader() {
  const [open, setOpen] = useState(false);
  const [navigation, setNavigation] = useState<MainNav | null>(null);

  return {
    open,
    navigation,
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
  const { open, navigation, openWith, close } = useDrawerHeader();

  const sections = useMemo((): SideDrawerSection[] => {
    if (!navigation) return [];
    const arenaItems = [
      {
        key: 'members',
        label: 'Roster',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Members' }),
      },
      {
        key: 'media',
        label: 'Media',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'MediaFeed' }),
      },
      {
        key: 'stats',
        label: 'Stats & Schedule',
        onPress: () =>
          goToSection(navigation, 'OrgHome', {
            screen: 'Stats',
            params: { mode: 'BR' },
          }),
      },
      {
        key: 'voice',
        label: 'Team Voice',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Voice' }),
      },
      {
        key: 'maps',
        label: 'Maps',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Maps' }),
      },
      {
        key: 'ruleBook',
        label: 'Rule Book',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'RuleBook' }),
      },
      {
        key: 'pointsTable',
        label: 'Points Table',
        onPress: () =>
          goToSection(navigation, 'OrgHome', { screen: 'PointsTable' }),
      },
      ...(isOwner
        ? [
            {
              key: 'orgSettings',
              label: 'Org Settings',
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

    return sections;
  }, [navigation, isOwner]);

  return { open, sections, openWith, close };
}

// Same sections GuildHomeScreen shows (guild-only members have no org).
export function useGuildDrawer() {
  const { open, navigation, openWith, close } = useDrawerHeader();

  const sections = useMemo((): SideDrawerSection[] => {
    if (!navigation) return [];
    return [
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
            key: 'guildRoster',
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
  }, [navigation]);

  return { open, sections, openWith, close };
}
