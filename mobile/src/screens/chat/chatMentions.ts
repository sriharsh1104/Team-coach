export function normalizeIgnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s~_\-.]+/g, '');
}

export type MentionCandidate = {
  userId: string;
  name: string;
  inGameName: string | null;
};

export function activeMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

export function filterMentionables<T extends MentionCandidate>(
  candidates: T[],
  query: string,
  limit = 6,
): T[] {
  const q = normalizeIgnKey(query);
  const withIgn = candidates.filter((c) => c.inGameName);
  return withIgn
    .filter((c) => {
      if (!q) return true;
      const ign = normalizeIgnKey(c.inGameName!);
      const name = normalizeIgnKey(c.name);
      return ign.includes(q) || name.includes(q);
    })
    .slice(0, limit);
}

export function insertMention(
  text: string,
  caret: number,
  start: number,
  ign: string,
): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const inserted = `@${ign} `;
  return { text: before + inserted + after, caret: before.length + inserted.length };
}

export function splitMentionParts(
  text: string,
  knownIgns: string[],
): Array<{ type: 'text' | 'mention'; value: string }> {
  if (!text) return [];
  const keys = new Set(knownIgns.map(normalizeIgnKey).filter(Boolean));
  const parts: Array<{ type: 'text' | 'mention'; value: string }> = [];
  const re = /@([^\s@]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const token = match[1]!;
    const isKnown = keys.size === 0 || keys.has(normalizeIgnKey(token));
    parts.push({
      type: isKnown ? 'mention' : 'text',
      value: match[0],
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) });
  }
  return parts;
}
