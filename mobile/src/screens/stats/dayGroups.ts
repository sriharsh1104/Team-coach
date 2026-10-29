import { ModeHistoryEntry } from '../../api/types';

export type DayGroup<T extends { recordedAt: string }> = {
  dayKey: string;
  label: string;
  entries: T[];
  kills: number;
  assists: number;
  damage: number;
};

function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(dayKey: string): string {
  const today = dayKeyFromIso(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dayKeyFromIso(yesterdayDate.toISOString());
  if (dayKey === today) return 'Today';
  if (dayKey === yesterday) return 'Yesterday';
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function groupEntriesByDay<
  T extends { recordedAt: string; kills: number; assists: number; damage: number },
>(entries: T[]): DayGroup<T>[] {
  const map = new Map<string, DayGroup<T>>();
  for (const entry of entries) {
    const key = dayKeyFromIso(entry.recordedAt);
    const group = map.get(key) ?? {
      dayKey: key,
      label: dayLabel(key),
      entries: [],
      kills: 0,
      assists: 0,
      damage: 0,
    };
    group.entries.push(entry);
    group.kills += entry.kills;
    group.assists += entry.assists;
    group.damage += entry.damage;
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}

export type { ModeHistoryEntry };
