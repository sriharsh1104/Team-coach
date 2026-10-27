import { io, Socket } from 'socket.io-client';

export function connectSocket(
  baseUrl: string,
  token: string,
  namespace = '/',
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseUrl}${namespace}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// For asserting a rejected connection (bad token). Auth lives in Socket.IO
// handshake middleware (server.use()) on both gateways, so a rejection
// (next(err)) means the handshake itself fails — the client gets
// 'connect_error' and never sees 'connect' at all, not a connect-then-
// disconnect sequence.
export function connectAndExpectRejection(
  baseUrl: string,
  token: string,
  namespace = '/',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseUrl}${namespace}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('expected connect_error, but socket connected instead'));
    }, 5000);
    socket.on('connect_error', () => {
      clearTimeout(timer);
      socket.disconnect();
      resolve();
    });
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error('expected rejection, but socket connected'));
    });
  });
}

// Both gateways only accept the token via handshake.auth.token now — the
// query-string fallback was removed (query params are far more likely to
// leak into server/proxy access logs than a value sent in the handshake
// body). This proves a client that only sends it as a query param — the
// old, no-longer-supported path — is rejected just like no token at all.
export function connectViaQueryTokenAndExpectRejection(
  baseUrl: string,
  token: string,
  namespace = '/',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseUrl}${namespace}`, {
      query: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('expected connect_error, but socket connected instead'));
    }, 5000);
    socket.on('connect_error', () => {
      clearTimeout(timer);
      socket.disconnect();
      resolve();
    });
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error('expected rejection, but socket connected via query-string token'));
    });
  });
}

// Socket.IO acknowledgement-style request/response (used by the voice
// gateway's getRtpCapabilities/createTransport/etc, which all return a value
// via ack callback rather than a separate named event).
export function emitAck<T = any>(
  socket: Socket,
  event: string,
  payload?: unknown,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: unknown, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

export function waitForEvent<T = any>(
  socket: Socket,
  event: string,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// For asserting an event does NOT arrive within a window — used to prove
// cross-org isolation (a message in org A must never reach a socket in org B).
export function assertNoEvent(
  socket: Socket,
  event: string,
  windowMs = 1000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, windowMs);
    socket.once(event, () => {
      clearTimeout(timer);
      reject(new Error(`received unexpected "${event}" event`));
    });
  });
}
