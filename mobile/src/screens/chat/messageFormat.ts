import { ChatMessage } from '../../api/types';
import { formatRoleBadge } from '../shared';

/** "4:49 pm" — local time the message was sent/received, same on every platform. */
export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${minutes} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * "Teammate · Coach" / "Owner Coach · Coach (Owner)".
 *
 * Your own messages keep the name — a sent bubble has no coloured plate, so
 * without it a right-aligned line barely reads as a message — but drop the
 * role badge: you already know what you are, and repeating it on every line
 * you send is pure noise.
 */
export function formatSenderLabel(message: ChatMessage, isMine = false): string {
  const badge = isMine
    ? null
    : formatRoleBadge(message.senderRole, message.senderIsOwner);
  return badge ? `${message.senderName} · ${badge}` : message.senderName;
}
