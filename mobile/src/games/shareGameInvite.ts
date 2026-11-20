import { Linking, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { gameInviteLink, gameInviteMessage } from './gameLinks';

export type ShareTarget = 'whatsapp' | 'telegram' | 'discord' | 'copy' | 'more';

export type ShareResult =
  | 'opened' // the chosen app was opened with the message ready to send
  | 'copied' // message copied; the user pastes it (Discord has no "prefill" link)
  | 'failed';

async function tryOpen(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // app not installed / scheme unknown → try the next (web) fallback
    }
  }
  return false;
}

/**
 * Builds the invite message + link for a room and sends it to the chosen
 * platform. WhatsApp and Telegram open their share screen with the text
 * already filled in. Discord cannot be pre-filled from outside, so the message
 * is copied and Discord opened — one paste to send.
 */
export async function shareGameInvite(
  target: ShareTarget,
  room: { id: string; title: string },
): Promise<ShareResult> {
  const link = gameInviteLink(room.id);
  const message = gameInviteMessage(room.title, link);
  const text = encodeURIComponent(message);

  try {
    switch (target) {
      case 'whatsapp':
        return (await tryOpen([`whatsapp://send?text=${text}`, `https://wa.me/?text=${text}`]))
          ? 'opened'
          : 'failed';
      case 'telegram': {
        const url = encodeURIComponent(link);
        const msg = encodeURIComponent(`🎮 Join my ${room.title} game on Sacred Esports!`);
        return (await tryOpen([
          `tg://msg_url?url=${url}&text=${msg}`,
          `https://t.me/share/url?url=${url}&text=${msg}`,
        ]))
          ? 'opened'
          : 'failed';
      }
      case 'discord':
        await Clipboard.setStringAsync(message);
        await tryOpen(['discord://', 'https://discord.com/app']);
        return 'copied';
      case 'copy':
        await Clipboard.setStringAsync(message);
        return 'copied';
      case 'more':
        await Share.share({ message });
        return 'opened';
    }
  } catch {
    return 'failed';
  }
}
