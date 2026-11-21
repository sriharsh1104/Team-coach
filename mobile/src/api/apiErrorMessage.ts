import { OFFLINE_ERROR_CODE } from '../net/networkStatus';

/**
 * NestJS ValidationPipe / HttpException payloads use `message` as a string
 * or string[]. Proxy errors (nginx 413 / 502 / 504 HTML pages) and axios
 * network failures have no usable JSON body — map those to a clear reason
 * instead of a generic fallback, so the user can tell *why* an upload failed.
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const ax = err as {
    response?: { status?: number; data?: { message?: string | string[] } };
    message?: string;
    code?: string;
  };
  if (ax?.code === OFFLINE_ERROR_CODE) {
    return "You're offline. Reconnect and try again.";
  }
  const msg = ax?.response?.data?.message;
  if (Array.isArray(msg)) {
    const joined = msg.filter(Boolean).join(', ').trim();
    if (joined) return joined;
  } else if (typeof msg === 'string' && msg.trim()) {
    return msg.trim();
  }

  const status = ax?.response?.status;
  if (status === 413) {
    return 'File is too large for the server (413). Try a smaller image or a shorter video.';
  }
  if (status === 408 || status === 504) {
    return `Server timed out (${status}). Check your connection and try again.`;
  }
  if (status === 502 || status === 503) {
    return `Server is unavailable right now (${status}). Try again in a moment.`;
  }

  if (!ax?.response) {
    if (ax?.code === 'ECONNABORTED' || /timeout/i.test(ax?.message ?? '')) {
      return 'Upload timed out. Check your connection and try again.';
    }
    if (typeof ax?.message === 'string' && ax.message.trim()) {
      // e.g. "Network Error" from axios when the API is unreachable or the
      // proxy dropped the connection mid-upload (often an oversize file).
      return ax.message.trim();
    }
  }
  return status ? `${fallback} (HTTP ${status})` : fallback;
}
