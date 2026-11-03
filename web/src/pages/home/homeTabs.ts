export type HomeTabId =
  | 'home'
  | 'tournaments'
  | 'records'
  | 'players'
  | 'guild';

export const HOME_TABS: Array<{ id: HomeTabId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'tournaments', label: 'What We Provide' },
  { id: 'records', label: 'Record' },
  { id: 'players', label: 'Roster' },
  { id: 'guild', label: 'Guild' },
];
