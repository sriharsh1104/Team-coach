import type { SideDrawerItem, SideDrawerSection } from '../ui/SideDrawer';

/** Map MainStack route name → SideDrawer item key. */
export function drawerItemKeyForRoute(routeName: string | undefined): string | null {
  switch (routeName) {
    case 'OrgHome':
      return 'teamChat';
    case 'GuildHome':
      return 'guildChat';
    case 'Members':
      return 'members';
    case 'MediaFeed':
      return 'media';
    case 'Stats':
    case 'Scrims':
    case 'AddEditScrim':
      return 'stats';
    case 'Voice':
      return 'teamChat';
    case 'GuildVoice':
      return 'guildChat';
    case 'Games':
    case 'GameRoom':
      return 'games';
    case 'GoLive':
      return 'goLive';
    case 'Health':
      return 'health';
    case 'DailyRoutine':
      return 'dailyRoutine';
    case 'Maps':
      return 'maps';
    case 'RuleBook':
      return 'ruleBook';
    case 'PointsTable':
      return 'pointsTable';
    case 'OrgSettings':
      return 'orgSettings';
    case 'Guild':
      return 'guildHome';
    case 'Profile':
      return 'profile';
    case 'SocialHandles':
      return 'socialHandles';
    case 'Announcements':
      return 'announcements';
    case 'Achievements':
      return 'achievements';
    case 'Admin':
      return 'admin';
    case 'Settings':
      return 'settings';
    case 'AccountSettings':
      return 'accountSettings';
    case 'Chat':
      return 'teamChat';
    default:
      return null;
  }
}

export function withActiveDrawerItem(
  sections: SideDrawerSection[],
  activeKey: string | null,
): SideDrawerSection[] {
  if (!activeKey) return sections;
  return sections.map((section) => ({
    ...section,
    items: section.items.map(
      (item): SideDrawerItem => ({
        ...item,
        active: item.key === activeKey,
      }),
    ),
  }));
}
