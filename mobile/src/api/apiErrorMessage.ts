/**
 * NestJS ValidationPipe / HttpException payloads use `message` as a string
 * or string[]. Axios network failures have no response — use the fallback.
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const ax = err as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const msg = ax?.response?.data?.message;
  if (Array.isArray(msg)) {
    const joined = msg.filter(Boolean).join(', ').trim();
    if (joined) return joined;
  } else if (typeof msg === 'string' && msg.trim()) {
    return msg.trim();
  }
  if (!ax?.response && typeof ax?.message === 'string' && ax.message.trim()) {
    // e.g. "Network Error" from axios when the API is unreachable
    return ax.message.trim();
  }
  return fallback;
}
