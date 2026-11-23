/**
 * Tiny pub/sub so the drawer badge can clear the moment the Announcements
 * screen marks everything read, instead of waiting for the drawer to be
 * reopened. Deliberately not a context: nothing here is rendered state, and
 * the drawer and the screen never share a parent that would own it.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Called by the Announcements screen once the server has cleared the count. */
export function announcementsRead() {
  for (const listener of [...listeners]) listener();
}

export function onAnnouncementsRead(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
