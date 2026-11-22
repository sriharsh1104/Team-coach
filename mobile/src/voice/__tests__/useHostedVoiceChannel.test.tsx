import { act, renderHook, waitFor } from '@testing-library/react-native';

/**
 * A controllable stand-in for livekit-client's Room. `fire` plays the server
 * events the hook listens for; `remoteParticipants` is the same Map shape the
 * real Room exposes.
 */
class FakeRoom {
  handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  remoteParticipants = new Map<string, FakeParticipant>();
  localParticipant = {
    identity: 'me',
    name: 'Me',
    permissions: { canPublish: true },
    setMicrophoneEnabled: jest.fn(),
    setScreenShareEnabled: jest.fn().mockResolvedValue(undefined),
    getTrackPublication: jest.fn(() => undefined),
    publishData: jest.fn().mockResolvedValue(undefined),
  };
  metadata = '';
  connect = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
  removeAllListeners = jest.fn(() => this.handlers.clear());

  on(event: string, cb: (...args: unknown[]) => void) {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
    return this;
  }

  fire(event: string, ...args: unknown[]) {
    for (const cb of this.handlers.get(event) ?? []) cb(...args);
  }

  addPeer(identity: string) {
    const p = new FakeParticipant(identity);
    this.remoteParticipants.set(identity, p);
    return p;
  }
}

class FakeParticipant {
  setVolume = jest.fn();
  name: string;
  metadata = '';
  attributes: Record<string, string> = {};
  isLocal = false;
  getTrackPublication = jest.fn(() => undefined);
  constructor(public identity: string) {
    this.name = identity;
  }
}

// Jest hoists jest.mock() factories above module-scope consts, so anything
// the factory references must carry a `mock` prefix — same rule the shared
// jest.setup.ts calls out for its SecureStore map.
let mockCurrentRoom: FakeRoom;

jest.mock('livekit-client', () => ({
  Room: jest.fn().mockImplementation(() => mockCurrentRoom),
  // Real enum values don't matter to the hook, only that they're distinct.
  RoomEvent: {
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    LocalTrackPublished: 'localTrackPublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    ConnectionQualityChanged: 'connectionQualityChanged',
    RoomMetadataChanged: 'roomMetadataChanged',
    ParticipantAttributesChanged: 'participantAttributesChanged',
    ParticipantPermissionsChanged: 'participantPermissionsChanged',
    DataReceived: 'dataReceived',
  },
  Track: {
    Source: { ScreenShare: 'screen_share', Camera: 'camera', Microphone: 'microphone' },
    Kind: { Video: 'video', Audio: 'audio' },
  },
  ConnectionQuality: { Excellent: 2, Good: 1, Poor: 0, Lost: 3 },
  DisconnectReason: {
    PARTICIPANT_REMOVED: 3,
    DUPLICATE_IDENTITY: 4,
    CLIENT_INITIATED: 1,
  },
  AudioPresets: {
    speech: { maxBitrate: 24_000 },
    music: { maxBitrate: 48_000 },
  },
}));

jest.mock('../voiceBackground', () => ({
  startVoiceBackground: jest.fn(),
  stopVoiceBackground: jest.fn(),
  addVoiceNotificationActionListener: jest.fn(() => jest.fn()),
}));

jest.mock('../voiceChanger', () => ({
  attachVoiceChanger: jest.fn(),
  playHandRaiseCue: jest.fn(),
}));

jest.mock('../../ui/toastBus', () => ({
  emitToast: jest.fn(),
  setToastListener: jest.fn(),
}));

jest.mock('../../api/voice', () => ({ moderateVoice: jest.fn() }));

jest.mock('../voiceCues', () => ({
  playVoiceCue: jest.fn(),
  preloadVoiceCues: jest.fn(),
  unloadVoiceCues: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { emitToast } = require('../../ui/toastBus');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { playVoiceCue } = require('../voiceCues');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useHostedVoiceChannel } = require('../useHostedVoiceChannel');

async function joinedHook() {
  const hook = renderHook(() => useHostedVoiceChannel('wss://lk', 'tok'));
  await act(async () => {
    await hook.result.current.join();
  });
  await waitFor(() => expect(hook.result.current.status).toBe('connected'));
  return hook;
}

describe('useHostedVoiceChannel', () => {
  beforeEach(() => {
    mockCurrentRoom = new FakeRoom();
    (emitToast as jest.Mock).mockClear();
    (playVoiceCue as jest.Mock).mockClear();
  });

  describe('playback state for people who arrive later', () => {
    it('silences a participant who joins while you are deafened', async () => {
      const hook = await joinedHook();
      act(() => hook.result.current.toggleDeafen());

      const late = mockCurrentRoom.addPeer('user-late');
      act(() => mockCurrentRoom.fire('participantConnected', late));

      // Before the fix nobody touched a late arrival, so you heard them
      // at full volume despite being deafened.
      expect(late.setVolume).toHaveBeenCalledWith(0);
    });

    it('re-applies a saved per-person volume when their track arrives', async () => {
      const hook = await joinedHook();
      const peer = mockCurrentRoom.addPeer('user-2');
      act(() => mockCurrentRoom.fire('participantConnected', peer));

      act(() => hook.result.current.setParticipantVolume('user-2', 0));
      peer.setVolume.mockClear();

      // A reconnect gives LiveKit a brand-new participant object.
      const rejoined = mockCurrentRoom.addPeer('user-2');
      act(() => mockCurrentRoom.fire('trackSubscribed', {}, {}, rejoined));

      expect(rejoined.setVolume).toHaveBeenCalledWith(0);
    });

    it('leaves an ordinary joiner at full volume', async () => {
      await joinedHook();
      const peer = mockCurrentRoom.addPeer('user-3');
      act(() => mockCurrentRoom.fire('participantConnected', peer));
      expect(peer.setVolume).toHaveBeenCalledWith(1);
    });
  });

  describe('join / leave cues', () => {
    it('beeps when someone joins', async () => {
      await joinedHook();
      act(() =>
        mockCurrentRoom.fire('participantConnected', mockCurrentRoom.addPeer('u2')),
      );
      expect(playVoiceCue).toHaveBeenCalledWith('join');
    });

    it('beeps when someone leaves', async () => {
      await joinedHook();
      act(() =>
        mockCurrentRoom.fire('participantDisconnected', new FakeParticipant('u2')),
      );
      expect(playVoiceCue).toHaveBeenCalledWith('leave');
    });

    it('stays silent for the people already in the room when you arrive', async () => {
      // LiveKit hands over the existing roster during connect; walking into a
      // busy channel must not fire a beep per person already in it.
      mockCurrentRoom.addPeer('u2');
      mockCurrentRoom.addPeer('u3');
      await joinedHook();
      expect(playVoiceCue).not.toHaveBeenCalled();
    });

    it('stays silent while deafened', async () => {
      const hook = await joinedHook();
      act(() => hook.result.current.toggleDeafen());
      (playVoiceCue as jest.Mock).mockClear();

      act(() =>
        mockCurrentRoom.fire('participantConnected', mockCurrentRoom.addPeer('u2')),
      );

      expect(playVoiceCue).not.toHaveBeenCalled();
    });

    it('beeps when the call drops under you', async () => {
      await joinedHook();
      act(() => mockCurrentRoom.fire('disconnected', undefined));
      expect(playVoiceCue).toHaveBeenCalledWith('leave');
    });

    it('does not beep when you leave on purpose', async () => {
      const hook = await joinedHook();
      act(() => hook.result.current.leave());
      (playVoiceCue as jest.Mock).mockClear();

      act(() => mockCurrentRoom.fire('disconnected', undefined));

      expect(playVoiceCue).not.toHaveBeenCalled();
    });
  });

  describe('reconnects', () => {
    it('stops claiming to be connected while LiveKit is retrying', async () => {
      const hook = await joinedHook();
      act(() => mockCurrentRoom.fire('reconnecting'));
      expect(hook.result.current.status).toBe('connecting');
    });

    it('restores playback state after the reconnect lands', async () => {
      const hook = await joinedHook();
      act(() => hook.result.current.toggleDeafen());
      const peer = mockCurrentRoom.addPeer('user-2');
      peer.setVolume.mockClear();

      act(() => mockCurrentRoom.fire('reconnecting'));
      act(() => mockCurrentRoom.fire('reconnected'));

      expect(hook.result.current.status).toBe('connected');
      expect(peer.setVolume).toHaveBeenCalledWith(0);
    });
  });

  describe('disconnects', () => {
    it('says what happened when the connection dies on its own', async () => {
      const hook = await joinedHook();
      act(() => mockCurrentRoom.fire('disconnected', undefined));

      expect(hook.result.current.status).toBe('idle');
      expect(emitToast).toHaveBeenCalledWith(
        expect.stringMatching(/could not reconnect|tap join/i),
      );
    });

    it('names a duplicate-identity kick instead of blaming the network', async () => {
      await joinedHook();
      act(() => mockCurrentRoom.fire('disconnected', 4));
      expect(emitToast).toHaveBeenCalledWith(
        expect.stringMatching(/another device/i),
      );
    });

    it('names a host removal', async () => {
      await joinedHook();
      act(() => mockCurrentRoom.fire('disconnected', 3));
      expect(emitToast).toHaveBeenCalledWith(
        expect.stringMatching(/removed from the voice channel/i),
      );
    });

    it('stays quiet when the user left on purpose', async () => {
      const hook = await joinedHook();
      act(() => hook.result.current.leave());
      (emitToast as jest.Mock).mockClear();

      act(() => mockCurrentRoom.fire('disconnected', undefined));

      expect(emitToast).not.toHaveBeenCalled();
      expect(hook.result.current.status).toBe('idle');
    });
  });
});
