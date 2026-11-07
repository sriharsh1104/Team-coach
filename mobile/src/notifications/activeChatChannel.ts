/**
 * Module-level pointer to the channel the user currently has open.
 * The foreground notification handler reads this so we don't flash a
 * banner for the thread they're already looking at.
 */
let activeChannelKey: string | null = null;

export function setActiveChatChannel(channelKey: string | null) {
  activeChannelKey = channelKey;
}

export function getActiveChatChannel() {
  return activeChannelKey;
}
