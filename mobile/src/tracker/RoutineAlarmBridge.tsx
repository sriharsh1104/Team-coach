import { useEffect } from 'react';
import { Linking } from 'react-native';
import { completeRoutine, localDay } from '../api/tracker';
import { getToken } from '../storage/tokenStorage';
import { emitToast } from '../ui/toastBus';

function parseRoutineDoneUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    // teamcoach://tracker/routine-done?id=<cuid>
    if (!url.includes('tracker/routine-done')) return null;
    const qIndex = url.indexOf('?');
    if (qIndex < 0) return null;
    const params = new URLSearchParams(url.slice(qIndex + 1));
    return params.get('id');
  } catch {
    return null;
  }
}

async function handleUrl(url: string | null) {
  const id = parseRoutineDoneUrl(url);
  if (!id) return;
  if (!(await getToken())) return;
  try {
    await completeRoutine(id, localDay());
    emitToast('Routine marked done');
  } catch {
    emitToast('Could not mark routine done');
  }
}

/**
 * Listens for `teamcoach://tracker/routine-done?id=` from the native
 * AlarmActivity Mark Done button.
 */
export function RoutineAlarmBridge() {
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });
    void Linking.getInitialURL().then((url) => void handleUrl(url));
    return () => sub.remove();
  }, []);
  return null;
}
