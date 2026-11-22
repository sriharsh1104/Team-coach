import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * App-wide nav ref so overlays outside NavigationContainer (e.g. the green
 * voice floating widget) can still navigate to Voice / GuildVoice.
 */
export const navigationRef = createNavigationContainerRef<any>();

export function getFocusedRouteNameFromRef(): string | undefined {
  if (!navigationRef.isReady()) return undefined;
  return navigationRef.getCurrentRoute()?.name;
}

/**
 * Route listeners live here rather than on the container ref. Once a
 * container is attached, `ref.addListener` forwards straight to THAT
 * container instance, so every subscriber goes deaf the moment RootNavigator
 * remounts — and it remounts on every login / org switch (it is keyed by
 * phase + user). RootNavigator pumps this set from onReady / onStateChange,
 * which survives those remounts.
 */
const routeListeners = new Set<(name: string | undefined) => void>();

export function subscribeToFocusedRoute(
  listener: (name: string | undefined) => void,
): () => void {
  routeListeners.add(listener);
  return () => {
    routeListeners.delete(listener);
  };
}

export function notifyFocusedRouteChanged(): void {
  const name = getFocusedRouteNameFromRef();
  routeListeners.forEach((listener) => {
    try {
      listener(name);
    } catch {
      // A bad subscriber must never break navigation.
    }
  });
}

export function navigateToVoice(room: 'team' | 'guild') {
  if (!navigationRef.isReady()) return;
  try {
    navigationRef.navigate(room === 'guild' ? 'GuildVoice' : 'Voice');
  } catch {
    // Navigator not ready / route missing on this stack.
  }
}
