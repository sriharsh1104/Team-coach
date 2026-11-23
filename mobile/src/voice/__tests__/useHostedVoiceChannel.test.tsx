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
    setCameraEnabled: jest.fn().mockResolvedValue(undefined),
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

type FakePublication = {
  isSubscribed: boolean;
  setSubscribed: jest.Mock;
  track: { kind: string } | null;
};

class FakeParticipant {
  setVolume = jest.fn();
  name: string;
  metadata = '';
  attributes: Record<string, string> = {};
  isLocal = false;
  getTrackPublication: jest.Mock = jest.fn(() => undefined);
  constructor(public identity: string) {
    this.name = identity;
  }

  /** Start sharing a screen. `subscribed: false` = the track has not landed yet. */
  share(opts: { subscribed?: boolean } = {}): FakePublication {
    const subscribed = opts.subscribed !== false;
    const pub: FakePublication = {
      isSubscribed: subscribed,
      setSubscribed: jest.fn(),
      track: subscribed ? { kind: 'video' } : null,
    };
    this.getTrackPublication = jest.fn((source: unknown) =>
      source === 'screen_share' ? pub : undefined,
    ) as jest.Mock;
    return pub;
  }

  /** Publish front camera (1-on-1 video switch). */
  camera(opts: { subscribed?: boolean } = {}): FakePublication {
    const subscribed = opts.subscribed !== false;
    const pub: FakePublication = {
      isSubscribed: subscribed,
      setSubscribed: jest.fn(),
      track: subscribed ? { kind: 'video' } : null,
    };
    this.getTrackPublication = jest.fn((source: unknown) =>
      source === 'camera' ? pub : undefined,
    ) as jest.Mock;
    return pub;
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
    TrackPublished: 'trackPublished',
    TrackUnpublished: 'trackUnpublished',
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
    telephone: { maxBitrate: 12_000 },
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

async function joinedHook(options: { room?: 'team' | 'guild' | 'direct' } = {}) {
  const hook = renderHook(() =>
    useHostedVoiceChannel('wss://lk', 'tok', { room: options.room }),
  );
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

  describe('watching someone else share their screen', () => {
    it('shows the share as soon as the track is subscribed', async () => {
      const hook = await joinedHook();
      const peer = mockCurrentRoom.addPeer('bob');
      peer.share();

      await act(async () => {
        mockCurrentRoom.fire('trackSubscribed', {}, {}, peer);
      });

      await waitFor(() => expect(hook.result.current.screenShare).toBeTruthy());
      expect(hook.result.current.screenShare).toMatchObject({
        participantId: 'bob',
        isLocal: false,
      });
      expect(hook.result.current.screenShare?.videoTrack).toBeTruthy();
    });

    // The watcher used to see absolutely nothing until the subscription
    // completed — no video and no sign anyone was sharing at all.
    it('announces the share from the publication, before the track arrives', async () => {
      const hook = await joinedHook();
      const peer = mockCurrentRoom.addPeer('bob');
      peer.share({ subscribed: false });

      await act(async () => {
        mockCurrentRoom.fire('trackPublished', {}, peer);
      });

      await waitFor(() => expect(hook.result.current.screenShare).toBeTruthy());
      expect(hook.result.current.screenShare).toMatchObject({
        participantId: 'bob',
        isLocal: false,
        // Null → the viewer renders "Waiting for video…" instead of nothing.
        videoTrack: null,
      });
    });

    it('subscribes itself to a share nothing subscribed us to', async () => {
      const hook = await joinedHook();
      const peer = mockCurrentRoom.addPeer('bob');
      const pub = peer.share({ subscribed: false });

      await act(async () => {
        mockCurrentRoom.fire('trackPublished', {}, peer);
      });

      await waitFor(() => expect(pub.setSubscribed).toHaveBeenCalledWith(true));
      expect(hook.result.current.screenShare?.participantId).toBe('bob');
    });

    it('does not re-subscribe one that is already subscribed', async () => {
      await joinedHook();
      const peer = mockCurrentRoom.addPeer('bob');
      const pub = peer.share({ subscribed: true });

      await act(async () => {
        mockCurrentRoom.fire('trackSubscribed', {}, {}, peer);
      });

      expect(pub.setSubscribed).not.toHaveBeenCalled();
    });

    it('marks the sharer in the participant list', async () => {
      const hook = await joinedHook();
      const peer = mockCurrentRoom.addPeer('bob');
      peer.share({ subscribed: false });

      await act(async () => {
        mockCurrentRoom.fire('trackPublished', {}, peer);
      });

      await waitFor(() =>
        expect(
          hook.result.current.participants.find((p: { id: string }) => p.id === 'bob')
            ?.isScreenSharing,
        ).toBe(true),
      );
    });

    it('clears the share when the publication goes away', async () => {
      const hook = await joinedHook();
      const peer = mockCurrentRoom.addPeer('bob');
      peer.share();
      await act(async () => {
        mockCurrentRoom.fire('trackSubscribed', {}, {}, peer);
      });
      await waitFor(() => expect(hook.result.current.screenShare).toBeTruthy());

      peer.getTrackPublication = jest.fn(() => undefined) as jest.Mock;
      await act(async () => {
        mockCurrentRoom.fire('trackUnpublished', {}, peer);
      });

      await waitFor(() => expect(hook.result.current.screenShare).toBeNull());
    });

    it('watching someone else never flips my own sharing flag on', async () => {
      const hook = await joinedHook();
      const peer = mockCurrentRoom.addPeer('bob');
      peer.share();

      await act(async () => {
        mockCurrentRoom.fire('trackSubscribed', {}, {}, peer);
      });

      await waitFor(() => expect(hook.result.current.screenShare).toBeTruthy());
      expect(hook.result.current.isScreenSharing).toBe(false);
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

  describe('1-on-1 switch to video (camera)', () => {
    it('refuses camera outside a direct call', async () => {
      const hook = await joinedHook({ room: 'team' });
      act(() => hook.result.current.toggleCamera());
      expect(emitToast).toHaveBeenCalledWith(
        expect.stringMatching(/1-on-1/i),
      );
      expect(
        mockCurrentRoom.localParticipant.setCameraEnabled,
      ).not.toHaveBeenCalled();
    });

    it('publishes the front camera on a direct call', async () => {
      const hook = await joinedHook({ room: 'direct' });
      await act(async () => {
        hook.result.current.toggleCamera();
      });
      await waitFor(() =>
        expect(
          mockCurrentRoom.localParticipant.setCameraEnabled,
        ).toHaveBeenCalledWith(true, { facingMode: 'user' }),
      );
    });

    it('shows a peer camera as soon as the track is subscribed', async () => {
      const hook = await joinedHook({ room: 'direct' });
      const peer = mockCurrentRoom.addPeer('bob');
      peer.camera();

      await act(async () => {
        mockCurrentRoom.fire('trackSubscribed', {}, {}, peer);
      });

      await waitFor(() => expect(hook.result.current.remoteCamera).toBeTruthy());
      expect(hook.result.current.remoteCamera).toMatchObject({
        participantId: 'bob',
        isLocal: false,
      });
      expect(hook.result.current.remoteCamera?.videoTrack).toBeTruthy();
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
