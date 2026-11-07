export type HomeTabId =
  | 'home'
  | 'tournaments'
  | 'records'
  | 'players'
  | 'guild';

// `/guild` is already the authenticated Guild Space route (see App.tsx) —
// this marketing tab (public profile + sign-in card) gets its own path,
// `/signin`, so the two don't collide.
export const TAB_PATHS: Record<HomeTabId, string> = {
  home: '/',
  tournaments: '/tournaments',
  records: '/records',
  players: '/roster',
  guild: '/signin',
};

export const HOME_TABS: Array<{ id: HomeTabId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'tournaments', label: 'What We Provide' },
  { id: 'records', label: 'Record' },
  { id: 'players', label: 'Roster' },
  { id: 'guild', label: 'Guild' },
];

export function pathToTab(pathname: string): HomeTabId {
  const match = HOME_TABS.find((t) => TAB_PATHS[t.id] === pathname);
  return match ? match.id : 'home';
}
