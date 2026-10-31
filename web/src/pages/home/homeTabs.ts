export type HomeTabId =
  | 'home'
  | 'app'
  | 'tournaments'
  | 'players'
  | 'team-login';

export const HOME_TABS: Array<{ id: HomeTabId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'app', label: 'App' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'players', label: 'Players' },
  { id: 'team-login', label: 'Team login' },
];
