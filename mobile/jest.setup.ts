// Shared mocks for every test file. Native modules that only work inside a
// real compiled app (voice/WebRTC, push notifications, sockets) are mocked
// here globally rather than per-test, since several screens import them
// transitively through navigation and would otherwise throw at import time
// under Jest the same way they would in an unsupported environment (e.g.
// @livekit/react-native-webrtc throws immediately if its native module isn't
// present — true on web too, which is why VoiceChannelScreen has a .web.tsx
// stub; Jest has the identical problem and needs the identical treatment).

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
  };
});

// expo-secure-store has no real native backing under Jest — an in-memory
// map mirrors its get/set/delete shape closely enough for tests that seed or
// clear a stored token (e.g. the access token in AuthContext/ChatScreen/
// VoiceChannelScreen).
// Jest hoists jest.mock() factories above module-scope consts, so the
// backing store has to be named with a `mock` prefix — otherwise the
// factory can't reference it ("out-of-scope variable").
const mockSecureStoreMemory = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(mockSecureStoreMemory.get(key) ?? null),
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureStoreMemory.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureStoreMemory.delete(key);
    return Promise.resolve();
  }),
  // Not a real SecureStore API — a test-only convenience for resetting
  // state between tests, mirroring @react-native-async-storage's mock.clear().
  clear: () => mockSecureStoreMemory.clear(),
}));

jest.mock('@livekit/react-native-webrtc', () => ({
  mediaDevices: { getUserMedia: jest.fn() },
  RTCPeerConnection: jest.fn(),
  RTCIceCandidate: jest.fn(),
  RTCSessionDescription: jest.fn(),
  MediaStream: jest.fn(),
}));

jest.mock('@livekit/react-native', () => ({
  registerGlobals: jest.fn(),
}));

jest.mock('mediasoup-client', () => ({
  Device: jest.fn(),
}));

jest.mock('livekit-client', () => ({
  Room: jest.fn(),
  RoomEvent: {},
}));

// Real expo-notifications warns loudly on import about Expo Go/SDK 53 removal
// as a side effect of its own module-level auto-registration code — noise we
// don't want in test output, and nothing in these tests needs real push
// notification behavior anyway (registerPushTokenWithBackend is mocked
// per-file wherever its actual behavior matters).
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'fake-token' }),
  setNotificationHandler: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  })),
}));
