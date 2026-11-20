import React from 'react';
import { Text } from 'react-native';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

/**
 * One small status line just above the composer: "X is typing…" takes
 * priority when present, otherwise (DM only) the peer's online/last-seen —
 * same priority order WhatsApp uses for its header subtitle.
 */
export function ChatStatusLine({ label }: { label: string | null }) {
  const styles = useThemedStyles(statusStyles);
  if (!label) return null;
  return (
    <Text style={styles.row} numberOfLines={1}>
      {label}
    </Text>
  );
}

export function typingLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function presenceLabel(presence: { online: boolean; lastSeenAt: string | null } | null): string | null {
  if (!presence) return null;
  if (presence.online) return 'Online';
  if (presence.lastSeenAt) return `Last seen ${timeAgo(presence.lastSeenAt)}`;
  return null;
}

function statusStyles(c: ThemeColors) {
  return {
    row: {
      paddingHorizontal: 16,
      paddingBottom: 4,
      fontSize: 12,
      color: c.textMuted,
    },
  };
}
