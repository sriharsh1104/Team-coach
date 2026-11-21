import { useEffect, useState } from 'react';
import { isOnline, subscribeNetworkStatus } from './networkStatus';

/** Re-renders the caller whenever the device goes offline or comes back. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => subscribeNetworkStatus(setOnline), []);
  return online;
}
