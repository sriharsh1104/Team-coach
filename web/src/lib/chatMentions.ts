/** Free emoji strip — no paid sticker pack; users can also type/paste any emoji. */
export const CHAT_EMOJIS = [
  '😀', '😂', '😍', '🔥', '👏', '💪', '🎯', '🏆',
  '😎', '🤝', '✅', '❌', '⚡', '🎮', '💬', '❤️',
  '👍', '👎', '🙌', '😅', '🥲', '🫡', '💀', '👀',
  '🥳', '😤', '🥺', '💯', '⭐', '🚀',
];

export function normalizeIgnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s~_\-.]+/g, '');
}

export type MentionCandidate = {
  userId: string;
  name: string;
  inGameName: string | null;
};

/** Active `@query` at caret — null when not composing a mention. */
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

export function filterMentionables(
  candidates: MentionCandidate[],
  query: string,
  limit = 6,
): MentionCandidate[] {
  const q = normalizeIgnKey(query);
  const withIgn = candidates.filter((c) => c.inGameName);
  const ranked = withIgn.filter((c) => {
    if (!q) return true;
    const ign = normalizeIgnKey(c.inGameName!);
    const name = normalizeIgnKey(c.name);
    return ign.includes(q) || name.includes(q);
  });
  return ranked.slice(0, limit);
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
  const next = before + inserted + after;
  return { text: next, caret: before.length + inserted.length };
}

/** Split message text so `@IGN` tokens can be highlighted. */
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
