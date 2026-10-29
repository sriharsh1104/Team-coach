import { apiBaseUrl } from '../api/client';

export type OrgRealtimeEvent = {
  type: 'stats.changed' | 'media.changed' | 'scrims.changed' | 'heartbeat';
  orgId?: string;
  at: string;
};

/**
 * Minimal SSE client over XHR so we can send Authorization (native
 * EventSource cannot). Works on iOS/Android/web Expo targets.
 */
export function connectOrgSse(
  token: string,
  onEvent: (event: OrgRealtimeEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  const xhr = new XMLHttpRequest();
  let cursor = 0;
  let buffer = '';
  let closed = false;

  const flushBlock = (block: string) => {
    const lines = block.split('\n');
    let data = '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        data += line.slice(5).trimStart();
      }
    }
    if (!data) return;
    try {
      onEvent(JSON.parse(data) as OrgRealtimeEvent);
    } catch {
      // ignore malformed chunks
    }
  };

  const onProgress = () => {
    const chunk = xhr.responseText.slice(cursor);
    cursor = xhr.responseText.length;
    buffer += chunk;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const block of parts) flushBlock(block);
  };

  xhr.open('GET', `${apiBaseUrl}/realtime/stream`);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');
  xhr.onprogress = onProgress;
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 3 || xhr.readyState === 4) onProgress();
  };
  xhr.onerror = () => {
    if (!closed) onError?.(new Error('SSE connection error'));
  };
  xhr.onloadend = () => {
    if (!closed) onError?.(new Error('SSE connection closed'));
  };
  xhr.send();

  return () => {
    closed = true;
    xhr.abort();
  };
}
