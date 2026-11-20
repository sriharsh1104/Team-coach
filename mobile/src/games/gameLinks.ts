/** Deep link scheme registered in app.config.ts (`scheme: 'teamcoach'`). */
export const GAME_LINK_PREFIX = 'teamcoach://games/room/';

export function gameRoomDeepLink(roomId: string): string {
  return `${GAME_LINK_PREFIX}${encodeURIComponent(roomId)}`;
}

/** Extract the room id from a game deep link, or null for any other URL. */
export function parseGameRoomLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^teamcoach:\/\/games\/room\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}
