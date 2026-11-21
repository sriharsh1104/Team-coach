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

// "Teammate · Coach" / "Owner Coach · Coach (Owner)" — role badge is shown
// next to the name for everyone but yourself (you already know your own role).
export function formatSenderLabel(message: ChatMessage): string {
  const badge = formatRoleBadge(message.senderRole, message.senderIsOwner);
  return badge ? `${message.senderName} · ${badge}` : message.senderName;
}
