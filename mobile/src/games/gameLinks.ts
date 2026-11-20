import { apiBaseUrl } from '../api/client';

/** Deep link scheme registered in app.config.ts (`scheme: 'teamcoach'`). */
export const GAME_LINK_PREFIX = 'teamcoach://games/room/';

export function gameRoomDeepLink(roomId: string): string {
  return `${GAME_LINK_PREFIX}${encodeURIComponent(roomId)}`;
}

/**
 * The link that is actually shared. WhatsApp / Discord / Telegram only make
 * https links tappable, so this is a web page on the API that bounces into
 * the app (see GamesLinkController on the backend).
 */
export function gameInviteLink(roomId: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/games/join/${encodeURIComponent(roomId)}`;
}

export function gameInviteMessage(title: string, link: string): string {
  return `🎮 Join my ${title} game on Sacred Esports!\nTap to join: ${link}`;
}

/** Extract the room id from a game invite link (app scheme or shared web link), or null. */
export function parseGameRoomLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/^teamcoach:\/\/games\/room\/([^/?#]+)/i) ??
    url.match(/^https?:\/\/[^/]+\/games\/join\/([^/?#]+)/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
