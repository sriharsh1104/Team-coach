const KEY = 'team-coach.announcementTemplates';
const MAX = 40;

export type SavedAnnouncementTemplate = {
  id: string;
  title: string;
  body: string;
  savedAt: string;
};

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

export function loadSavedAnnouncementTemplates(): SavedAnnouncementTemplate[] {
  try {
    return parseList(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveAnnouncementTemplate(input: {
  title: string;
  body: string;
}): SavedAnnouncementTemplate[] {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return loadSavedAnnouncementTemplates();

  const prev = loadSavedAnnouncementTemplates();
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

  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

export function removeSavedAnnouncementTemplate(
  id: string,
): SavedAnnouncementTemplate[] {
  const next = loadSavedAnnouncementTemplates().filter((t) => t.id !== id);
  try {
    if (next.length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return next;
}
