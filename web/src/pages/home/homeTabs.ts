export type HomeTabId =
  | 'home'
  | 'app'
  | 'tournaments'
  | 'records'
  | 'players';

export const HOME_TABS: Array<{ id: HomeTabId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'app', label: 'App' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'records', label: 'Records' },
  { id: 'players', label: 'Players' },
];
