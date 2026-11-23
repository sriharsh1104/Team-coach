import { Platform } from 'react-native';

const KEY = 'team-coach.announcementTemplates';
const FILE = 'announcement-templates.json';
const MAX = 40;

export type SavedAnnouncementTemplate = {
  id: string;
  title: string;
  body: string;
  savedAt: string;
};

function webRead(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function webWrite(value: string | null) {
  try {
    if (value == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    /* quota / private mode */
  }
}

async function nativeRead(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
  const path = `${FileSystem.documentDirectory}${FILE}`;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(path);
}

async function nativeWrite(value: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
  const path = `${FileSystem.documentDirectory}${FILE}`;
  if (value == null) {
    await FileSystem.deleteAsync(path, { idempotent: true });
    return;
  }
  await FileSystem.writeAsStringAsync(path, value);
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') return webRead();
  try {
    return await nativeRead();
  } catch {
    return null;
  }
}

async function writeRaw(value: string | null) {
  if (Platform.OS === 'web') {
    webWrite(value);
    return;
  }
  try {
    await nativeWrite(value);
  } catch (err) {
    console.warn('save announcement templates failed:', err);
  }
}

function parseList(raw: string | null): SavedAnnouncementTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedAnnouncementTemplate[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t) =>
        t &&
        typeof t.id === 'string' &&
        typeof t.title === 'string' &&
        typeof t.body === 'string',
    );
  } catch {
    return [];
  }
}

export async function loadSavedAnnouncementTemplates(): Promise<
  SavedAnnouncementTemplate[]
> {
  return parseList(await readRaw());
}

export async function saveAnnouncementTemplate(input: {
  title: string;
  body: string;
}): Promise<SavedAnnouncementTemplate[]> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return loadSavedAnnouncementTemplates();

  const prev = await loadSavedAnnouncementTemplates();
  // Same title → replace body so the list stays one row per recognizable name.
  const without = prev.filter(
    (t) => t.title.trim().toLowerCase() !== title.toLowerCase(),
  );
  const next: SavedAnnouncementTemplate[] = [
    {
      id: `t-${Date.now()}`,
      title,
      body,
      savedAt: new Date().toISOString(),
    },
    ...without,
  ].slice(0, MAX);

  await writeRaw(JSON.stringify(next));
  return next;
}

export async function removeSavedAnnouncementTemplate(
  id: string,
): Promise<SavedAnnouncementTemplate[]> {
  const next = (await loadSavedAnnouncementTemplates()).filter((t) => t.id !== id);
  await writeRaw(next.length ? JSON.stringify(next) : null);
  return next;
}
