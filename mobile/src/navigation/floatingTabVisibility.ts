import { useEffect, useState } from 'react';

/**
 * ChatHub sets this while a conversation is open so the docked floating
 * tab bar can hide and free the composer.
 */
let chatOpen = false;
const listeners = new Set<(open: boolean) => void>();

export function setFloatingTabChatOpen(open: boolean): void {
  if (chatOpen === open) return;
  chatOpen = open;
  listeners.forEach((l) => {
    try {
      l(open);
    } catch {
      // ignore bad subscribers
    }
  });
}

export function getFloatingTabChatOpen(): boolean {
  return chatOpen;
}

export function useFloatingTabChatOpen(): boolean {
  const [open, setOpen] = useState(chatOpen);
  useEffect(() => {
    listeners.add(setOpen);
    setOpen(chatOpen);
    return () => {
      listeners.delete(setOpen);
    };
  }, []);
  return open;
}

/** Immersive routes where the docked tab bar should stay hidden. */
export function hideFloatingTabForRoute(routeName: string | null | undefined): boolean {
  if (!routeName) return false;
  return (
    routeName === 'GameRoom' ||
    routeName === 'DirectVoice' ||
    routeName === 'Chat'
  );
}

export function floatingTabActiveForRoute(
  routeName: string | null | undefined,
): 'chat' | 'games' | 'goLive' | 'call' {
  switch (routeName) {
    case 'Games':
    case 'GameRoom':
    case 'GamesLeaderboard':
      return 'games';
    case 'GoLive':
      return 'goLive';
    case 'GuildVoice':
      return 'call';
    default:
      return 'chat';
  }
}
