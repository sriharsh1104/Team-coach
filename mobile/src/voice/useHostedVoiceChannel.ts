import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { Platform } from 'react-native';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  Participant,
  ConnectionQuality,
  DisconnectReason,
  Track,
  AudioPresets,
  type VideoTrack,
} from 'livekit-client';
import { moderateVoice } from '../api/voice';
import { isLiveStreaming } from '../media/liveStreamer';
import { isScreenRecording } from '../media/screenRecorder';
import { emitToast } from '../ui/toastBus';
import {
  addVoiceNotificationActionListener,
  startVoiceBackground,
  stopVoiceBackground,
} from './voiceBackground';
import {
  VoiceChannelController,
  VoiceChannelStatus,
  VoiceParticipant,
  VoiceScreenShare,
  ConnectionQualityLevel,
} from './types';
import type { VoiceRoomKind } from './types';
import { attachVoiceChanger, playHandRaiseCue } from './voiceChanger';
import { playVoiceCue, preloadVoiceCues, unloadVoiceCues } from './voiceCues';
import { setVoiceScreenSharing } from './voiceScreenShareGate';
import { createVoiceReconnectPolicy } from './voiceReconnect';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function mapConnectionQuality(q: ConnectionQuality): ConnectionQualityLevel {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 'excellent';
    case ConnectionQuality.Good:
      return 'good';
    case ConnectionQuality.Poor:
      return 'poor';
    case ConnectionQuality.Lost:
      return 'lost';
    default:
      return 'unknown';
  }
}

// Only hand-raise travels as a data message. Kick / mute used to be
// client-sent data messages that any modified client could fake; they now go
// through POST /voice/moderate and are enforced by the server.
type DataMsg = { type: 'hand_raise'; raised: boolean };

/** Mirror of backend hosted-room-state (kept tiny on purpose). */
type RoomState = { listenOnly: boolean; muted: string[]; speakers: string[] };
const EMPTY_STATE: RoomState = { listenOnly: false, muted: [], speakers: [] };

function parseRoomState(metadata: string | undefined): RoomState {
  if (!metadata) return EMPTY_STATE;
  try {
    const raw = JSON.parse(metadata) as Partial<RoomState>;
    return {
      listenOnly: raw.listenOnly === true,
      muted: Array.isArray(raw.muted) ? raw.muted : [],
      speakers: Array.isArray(raw.speakers) ? raw.speakers : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function isModeratorParticipant(p: Participant): boolean {
  return p.attributes?.mod === '1';
}

/** Server mints the access token with `metadata: JSON.stringify({ avatarUrl })`. */
function parseParticipantAvatarUrl(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const raw = JSON.parse(metadata) as { avatarUrl?: string | null };
    return raw.avatarUrl ?? null;
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: string };
  const m = e?.response?.data?.message;
  if (typeof m === 'string' && m) return m;
  if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  return e?.message || 'Could not do that. Try again.';
}

export type HostedVoiceOptions = {
  room?: VoiceRoomKind;
  /** From the server's token response — never derived on the client. */
  canModerate?: boolean;
  max?: number;
};

export function useHostedVoiceChannel(
  url: string,
  token: string,
  options: HostedVoiceOptions = {},
): VoiceChannelController {
  const voiceRoom = options.room ?? 'team';
  const isGuild = voiceRoom === 'guild';
  const [status, setStatus] = useState<VoiceChannelStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isLocalHandRaised, setIsLocalHandRaised] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShare, setScreenShare] = useState<VoiceScreenShare | null>(null);
  // Guild voice: host-mute state, derived from room metadata + server permissions.
  const [roomState, setRoomState] = useState<RoomState>(EMPTY_STATE);
  const [isHostMuted, setIsHostMuted] = useState(false);
  const isHostMutedRef = useRef(false);
  const isMutedRef = useRef(false);
  const roomStateRef = useRef<RoomState>(EMPTY_STATE);
  const isScreenSharingRef = useRef(false);
  isMutedRef.current = isMuted;

  const roomRef = useRef<Room | null>(null);
  /**
   * Gates the join/leave beeps until our own connect has finished. LiveKit
   * hands us the existing roster during connect; without this, walking into a
   * busy channel would fire a beep per person already in it.
   */
  const cuesArmedRef = useRef(false);
  /** Avoid toast spam while LiveKit keeps firing Reconnecting. */
  const reconnectToastShownRef = useRef(false);
  // Per-participant local volumes (0-1); default 1 until changed
  const localVolumesRef = useRef<Map<string, number>>(new Map());
  // Participants who have raised their hand
  const handRaisedIdsRef = useRef<Set<string>>(new Set());
  // Active speaking participants
  const speakingIdsRef = useRef<Set<string>>(new Set());
  // Per-participant connection quality
  const connectionQualitiesRef = useRef<Map<string, ConnectionQualityLevel>>(new Map());
  // Track deafen state in a ref for use inside callbacks
  const isDeafenedRef = useRef(false);
  const isPushToTalkRef = useRef(false);

  /**
   * Playback state lives on the RemoteParticipant object, and LiveKit builds a
   * fresh one for every join and every reconnect. Deafen and per-person volume
   * therefore have to be re-applied to each arrival — looping the roster once
   * when the user hits deafen only covers whoever was already in the room.
   */
  const applyPlaybackTo = useCallback((participant: RemoteParticipant) => {
    const volume = isDeafenedRef.current
      ? 0
      : (localVolumesRef.current.get(participant.identity) ?? 1);
    try {
      participant.setVolume(volume);
    } catch (err) {
      console.warn('setVolume failed:', err);
    }
  }, []);

  /** Re-applies playback to everyone currently in the room. */
  const applyPlaybackToAll = useCallback(
    (room: Room) => {
      for (const p of room.remoteParticipants.values()) applyPlaybackTo(p);
    },
    [applyPlaybackTo],
  );

  const refreshScreenShare = useCallback((room: Room) => {
    const localPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const localTrack = localPub?.track;
    if (localTrack && localTrack.kind === Track.Kind.Video) {
      const next: VoiceScreenShare = {
        participantId: room.localParticipant.identity,
        participantName: room.localParticipant.name || 'You',
        isLocal: true,
        videoTrack: localTrack as VideoTrack,
      };
      setScreenShare(next);
      isScreenSharingRef.current = true;
      setIsScreenSharing(true);
      setVoiceScreenSharing(true);
      return;
    }

    for (const p of room.remoteParticipants.values()) {
      // The PUBLICATION is what says "this person is sharing" — it exists the
      // moment they start. `pub.track` only appears once we have subscribed,
      // which lags behind and can fail outright. Keying the whole viewer off
      // the track meant a watcher saw nothing at all: no video, and no sign
      // that anyone was sharing in the first place.
      const pub = p.getTrackPublication(Track.Source.ScreenShare);
      if (!pub) continue;

      // Rescue a publication nothing subscribed us to (server-side subscribe
      // settings, or it appeared while we were reconnecting). No-op when we
      // are already subscribed.
      if (!pub.isSubscribed) {
        try {
          pub.setSubscribed(true);
        } catch (err) {
          console.warn('subscribe to screen share failed:', err);
        }
      }

      const track = pub.track;
      setScreenShare({
        participantId: p.identity,
        participantName: p.name || p.identity,
        isLocal: false,
        // Null until the track lands — the viewer shows "Waiting for video…".
        videoTrack:
          track && track.kind === Track.Kind.Video ? (track as VideoTrack) : null,
      });
      isScreenSharingRef.current = false;
      setIsScreenSharing(false);
      setVoiceScreenSharing(false);
      return;
    }

    setScreenShare(null);
    if (isScreenSharingRef.current) {
      isScreenSharingRef.current = false;
      setIsScreenSharing(false);
      setVoiceScreenSharing(false);
    }
  }, []);

  const syncParticipants = useCallback((room: Room) => {
    setParticipants(
      [...room.remoteParticipants.values()].map((p: RemoteParticipant) => {
        const vol = localVolumesRef.current.get(p.identity) ?? 1;
        // Publication, not track — see refreshScreenShare.
        const sharing = !!p.getTrackPublication(Track.Source.ScreenShare);
        return {
          id: p.identity,
          name: p.name || p.identity,
          avatarUrl: parseParticipantAvatarUrl(p.metadata),
          isLocallyMuted: vol === 0,
          isSpeaking: speakingIdsRef.current.has(p.identity),
          isHandRaised: handRaisedIdsRef.current.has(p.identity),
          localVolume: vol,
          connectionQuality: connectionQualitiesRef.current.get(p.identity) ?? 'unknown',
          isScreenSharing: sharing,
          ...(isGuild
            ? {
                isModerator: isModeratorParticipant(p),
                isHostMuted:
                  !isModeratorParticipant(p) &&
                  (roomStateRef.current.muted.includes(p.identity) ||
                    (roomStateRef.current.listenOnly &&
                      !roomStateRef.current.speakers.includes(p.identity))),
              }
            : {}),
        };
      }),
    );
    refreshScreenShare(room);
  }, [isGuild, refreshScreenShare]);

  const publishData = useCallback((msg: DataMsg, destinationIdentities?: string[]) => {
    const room = roomRef.current;
    if (!room) return;
    const opts: { reliable: boolean; destinationIdentities?: string[] } = { reliable: true };
    if (destinationIdentities) opts.destinationIdentities = destinationIdentities;
    room.localParticipant
      .publishData(encoder.encode(JSON.stringify(msg)), opts)
      .catch((err) => console.warn('publishData error:', err));
  }, []);

  const leave = useCallback(() => {
    // Ref first, disconnect second: RoomEvent.Disconnected fires after this
    // returns, and it uses `roomRef.current !== room` to tell "the user left"
    // from "the connection died".
    const room = roomRef.current;
    roomRef.current = null;
    cuesArmedRef.current = false;
    void unloadVoiceCues();
    if (isScreenSharingRef.current) {
      room?.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
    }
    room?.disconnect();
    stopVoiceBackground();
    AudioSession.stopAudioSession().catch(() => {});
    localVolumesRef.current.clear();
    handRaisedIdsRef.current.clear();
    speakingIdsRef.current.clear();
    connectionQualitiesRef.current.clear();
    setStatus('idle');
    setParticipants([]);
    setIsMuted(false);
    setIsLocalHandRaised(false);
    setIsDeafened(false);
    setIsPushToTalk(false);
    isDeafenedRef.current = false;
    isPushToTalkRef.current = false;
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);
    setScreenShare(null);
    setVoiceScreenSharing(false);
    roomStateRef.current = EMPTY_STATE;
    isHostMutedRef.current = false;
    setRoomState(EMPTY_STATE);
    setIsHostMuted(false);
  }, []);

  const joiningRef = useRef(false);

  const join = useCallback(async () => {
    // A double tap used to open two Rooms that fought over the mic.
    if (joiningRef.current) return;
    joiningRef.current = true;
    // Rejoin (after an error / kick): close the old Room before opening a new one.
    if (roomRef.current) {
      roomRef.current.removeAllListeners();
      await roomRef.current.disconnect().catch(() => undefined);
      roomRef.current = null;
    }
    setStatus('connecting');
    localVolumesRef.current.clear();
    handRaisedIdsRef.current.clear();
    speakingIdsRef.current.clear();
    connectionQualitiesRef.current.clear();
    setIsLocalHandRaised(false);
    setIsDeafened(false);
    setIsPushToTalk(false);
    setIsScreenSharing(false);
    setScreenShare(null);
    isDeafenedRef.current = false;
    isPushToTalkRef.current = false;
    isScreenSharingRef.current = false;
    setVoiceScreenSharing(false);
    try {
      // Explicit, not just relying on LiveKit's own defaults — without
      // echoCancellation the loudspeaker's own output gets picked back up
      // by the mic and bounces back to everyone else in the room.
      const room = new Room({
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        publishDefaults: {
          // music bitrate stays clearer than speech+DTX (that combo was
          // chopping mid-words into a "ghrr ghrr" rumble on some Androids).
          audioPreset: AudioPresets.music,
          dtx: false,
        },
        // Network drops: keep retrying the same call for ~1 min, then exit.
        reconnectPolicy: createVoiceReconnectPolicy(),
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        // Someone joining while you are deafened used to come in audible.
        applyPlaybackTo(p);
        // Deafen means "silence everything", so it mutes the cues too —
        // same rule the hand-raise beep already follows.
        if (cuesArmedRef.current && !isDeafenedRef.current) playVoiceCue('join');
        syncParticipants(room);
      });
      // Some Android devices populate remotes a tick after connect — keep the
      // roster in sync when tracks arrive too. The track is also the first
      // point at which setVolume has anything to act on, so re-apply here.
      room.on(RoomEvent.TrackSubscribed, (_track, _pub, p: RemoteParticipant) => {
        applyPlaybackTo(p);
        syncParticipants(room);
      });
      room.on(RoomEvent.TrackUnsubscribed, () => {
        syncParticipants(room);
      });
      // A remote screen share is announced by TrackPublished well before
      // TrackSubscribed fires — and if the subscription never completes,
      // TrackSubscribed never fires at all. Without these the watcher's
      // screen stayed blank through the entire share.
      room.on(RoomEvent.TrackPublished, () => {
        syncParticipants(room);
      });
      room.on(RoomEvent.TrackUnpublished, () => {
        syncParticipants(room);
      });
      room.on(RoomEvent.LocalTrackPublished, () => {
        syncParticipants(room);
      });
      room.on(RoomEvent.LocalTrackUnpublished, () => {
        syncParticipants(room);
      });
      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        if (cuesArmedRef.current && !isDeafenedRef.current) playVoiceCue('leave');
        localVolumesRef.current.delete(p.identity);
        handRaisedIdsRef.current.delete(p.identity);
        speakingIdsRef.current.delete(p.identity);
        connectionQualitiesRef.current.delete(p.identity);
        syncParticipants(room);
      });
      // LiveKit retries a dropped connection on its own. Without these two
      // the UI kept claiming "connected" with dead audio for the whole retry,
      // and the user had no idea anything had happened.
      room.on(RoomEvent.Reconnecting, () => {
        if (roomRef.current !== room) return;
        setStatus('connecting');
        if (!reconnectToastShownRef.current) {
          reconnectToastShownRef.current = true;
          emitToast('Network dropped — reconnecting for up to 1 min…');
        }
      });
      room.on(RoomEvent.Reconnected, () => {
        if (roomRef.current !== room) return;
        // Remote participants are rebuilt by the reconnect, so deafen and
        // per-person volumes have to be re-applied or everyone comes back
        // at full volume.
        applyPlaybackToAll(room);
        syncParticipants(room);
        setStatus('connected');
        if (reconnectToastShownRef.current) {
          emitToast('Back in the voice call');
        }
        reconnectToastShownRef.current = false;
      });

      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        // Our own leave() already cleared the ref and reset the UI.
        const wasLeave = roomRef.current !== room;
        roomRef.current = null;
        reconnectToastShownRef.current = false;
        // Dropping out ourselves is the one the user is most likely to miss,
        // since the screen may not even be open — beep before the toast.
        if (cuesArmedRef.current && !wasLeave) playVoiceCue('leave');
        cuesArmedRef.current = false;
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
          emitToast('You were removed from the voice channel by a host.');
        } else if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
          emitToast('You joined voice from another device, so this one left.');
        } else if (!wasLeave) {
          // Retries exhausted (~1 min) — leave the session so Join works again.
          emitToast('Could not reconnect in 1 min — tap Join to get back in.');
        }
        stopVoiceBackground();
        // join() starts a fresh session; without this the audio route stays
        // in call mode and the mic indicator can hang around.
        AudioSession.stopAudioSession().catch(() => {});
        setStatus('idle');
        setParticipants([]);
        setIsMuted(false);
        setIsLocalHandRaised(false);
        setIsDeafened(false);
        setIsPushToTalk(false);
        isDeafenedRef.current = false;
        isPushToTalkRef.current = false;
        speakingIdsRef.current.clear();
        connectionQualitiesRef.current.clear();
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        speakingIdsRef.current = new Set(
          speakers
            .filter((s) => !s.isLocal)
            .map((s) => s.identity),
        );
        syncParticipants(room);
      });
      room.on(
        RoomEvent.ConnectionQualityChanged,
        (quality: ConnectionQuality, participant: Participant) => {
          if (!participant.isLocal) {
            connectionQualitiesRef.current.set(
              participant.identity,
              mapConnectionQuality(quality),
            );
            syncParticipants(room);
          }
        },
      );
      // Guild host-mute: the room metadata carries the mute list, permissions
      // carry the server-enforced result for this device.
      const refreshHostMuted = () => {
        const canPublish = room.localParticipant.permissions?.canPublish !== false;
        const muted = !canPublish;
        if (muted && !isHostMutedRef.current) {
          // Server just revoked our mic — reflect it locally.
          setIsMuted(true);
          emitToast('A host muted you. Raise your hand to ask for the mic.');
        }
        isHostMutedRef.current = muted;
        setIsHostMuted(muted);
      };
      if (isGuild) {
        room.on(RoomEvent.RoomMetadataChanged, (metadata: string) => {
          const next = parseRoomState(metadata);
          roomStateRef.current = next;
          setRoomState(next);
          syncParticipants(room);
        });
        room.on(RoomEvent.ParticipantAttributesChanged, () => syncParticipants(room));
        room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
          if (participant?.isLocal) refreshHostMuted();
          syncParticipants(room);
        });
      }
      room.on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, participant?: RemoteParticipant) => {
          try {
            const msg = JSON.parse(decoder.decode(payload)) as DataMsg;
            if (msg.type === 'hand_raise' && participant) {
              if (msg.raised) {
                // Beep once when a hand goes up (not on repeats / when deafened).
                if (
                  !handRaisedIdsRef.current.has(participant.identity) &&
                  !isDeafenedRef.current
                ) {
                  playHandRaiseCue();
                }
                handRaisedIdsRef.current.add(participant.identity);
              } else {
                handRaisedIdsRef.current.delete(participant.identity);
              }
              syncParticipants(room);
            }
          } catch {
            // Ignore malformed data messages
          }
        },
      );

      // Call-style audio routing (speaker/earpiece/bluetooth, Android
      // VOICE_COMMUNICATION mode). LiveKit RN needs this started explicitly.
      try {
        await AudioSession.configureAudio({
          android: { audioTypeOptions: AndroidAudioTypePresets.communication },
        });
        await AudioSession.startAudioSession();
      } catch (err) {
        console.warn('AudioSession setup failed (continuing):', err);
      }
      await room.connect(url, token);
      if (roomRef.current !== room) {
        // Left (or unmounted) while we were still connecting.
        room.removeAllListeners();
        await room.disconnect().catch(() => undefined);
        return;
      }
      if (isGuild) {
        const initial = parseRoomState(room.metadata);
        roomStateRef.current = initial;
        setRoomState(initial);
      }
      // Joined while muted by a host (the token has no publish right): stay
      // silent instead of failing the whole join on the mic publish.
      const startMuted = room.localParticipant.permissions?.canPublish === false;
      isHostMutedRef.current = startMuted;
      setIsHostMuted(startMuted);
      if (!startMuted) {
        await room.localParticipant.setMicrophoneEnabled(true);
        attachVoiceChanger();
      }
      syncParticipants(room);
      setIsMuted(startMuted);
      setStatus('connected');
      // Decode both clips now so the first arrival isn't silent.
      preloadVoiceCues();
      cuesArmedRef.current = true;
      // Late roster sync: LiveKit can still be hydrating remoteParticipants
      // right after connect on older phones.
      setTimeout(() => {
        if (roomRef.current === room) syncParticipants(room);
      }, 250);
      setTimeout(() => {
        if (roomRef.current === room) syncParticipants(room);
      }, 1000);
    } catch (err: any) {
      // Don't leave a half-connected Room holding the mic / audio session.
      const failed = roomRef.current;
      roomRef.current = null;
      failed?.removeAllListeners();
      failed?.disconnect().catch(() => undefined);
      AudioSession.stopAudioSession().catch(() => {});
      setErrorMessage(err?.message ?? 'Could not join voice channel');
      setStatus('error');
    } finally {
      joiningRef.current = false;
    }
    // Both playback helpers are stable (no changing deps), so listing them
    // doesn't churn `join` — it just keeps the lint rule honest.
  }, [url, token, isGuild, syncParticipants, applyPlaybackTo, applyPlaybackToAll]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    // Don't toggle mic in PTT mode; pttStart/pttStop control it
    if (isPushToTalkRef.current) return;
    if (isHostMutedRef.current) {
      emitToast('A host muted you. Raise your hand to ask for the mic.');
      return;
    }
    setIsMuted((prev) => {
      const nextMuted = !prev;
      room.localParticipant.setMicrophoneEnabled(!nextMuted).then(
        () => {
          if (!nextMuted) attachVoiceChanger();
        },
        (err) => console.warn('mic toggle failed:', err),
      );
      return nextMuted;
    });
  }, []);

  const setParticipantVolume = useCallback(
    (participantId: string, volume: number) => {
      const room = roomRef.current;
      if (!room) return;
      const participant = room.remoteParticipants.get(participantId);
      const clamped = Math.max(0, Math.min(1, volume));
      localVolumesRef.current.set(participantId, clamped);
      if (participant && !isDeafenedRef.current) {
        participant.setVolume(clamped);
      }
      syncParticipants(room);
    },
    [syncParticipants],
  );

  const toggleParticipantMute = useCallback(
    (participantId: string) => {
      const currentVol = localVolumesRef.current.get(participantId) ?? 1;
      const nextVol = currentVol === 0 ? 1 : 0;
      setParticipantVolume(participantId, nextVol);
    },
    [setParticipantVolume],
  );

  const toggleHandRaise = useCallback(() => {
    setIsLocalHandRaised((prev) => {
      const next = !prev;
      publishData({ type: 'hand_raise', raised: next });
      return next;
    });
  }, [publishData]);

  const hostAction = useCallback(
    (action: 'muteAll' | 'unmuteAll' | 'mute' | 'unmute' | 'kick', userId?: string) => {
      moderateVoice(voiceRoom, action, userId).catch((err) => {
        console.warn(`voice ${action} failed:`, err);
        emitToast(errorText(err));
      });
    },
    [voiceRoom],
  );

  const kickParticipant = useCallback(
    (participantId: string) => hostAction('kick', participantId),
    [hostAction],
  );
  const muteAll = useCallback(() => hostAction('muteAll'), [hostAction]);
  const unmuteAll = useCallback(() => hostAction('unmuteAll'), [hostAction]);
  const setParticipantHostMuted = useCallback(
    (id: string, muted: boolean) => hostAction(muted ? 'mute' : 'unmute', id),
    [hostAction],
  );

  const toggleDeafen = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setIsDeafened((prev) => {
      const nextDeafened = !prev;
      isDeafenedRef.current = nextDeafened;
      // Deafen only silences incoming audio — mic stays under mute / PTT control.
      applyPlaybackToAll(room);
      return nextDeafened;
    });
  }, [applyPlaybackToAll]);

  const toggleScreenShare = useCallback(() => {
    const room = roomRef.current;
    if (!room || status !== 'connected') return;
    if (Platform.OS === 'web') {
      emitToast('Screen share is available on the Android app');
      return;
    }
    if (isScreenSharingRef.current) {
      room.localParticipant.setScreenShareEnabled(false).then(
        () => {
          isScreenSharingRef.current = false;
          setIsScreenSharing(false);
          setVoiceScreenSharing(false);
          refreshScreenShare(room);
        },
        (err) => {
          console.warn('stop screen share failed:', err);
          emitToast('Could not stop screen share');
        },
      );
      return;
    }
    if (isLiveStreaming()) {
      emitToast('Stop Go Live before sharing your screen in voice');
      return;
    }
    if (isScreenRecording()) {
      emitToast('Stop screen recording before sharing in voice');
      return;
    }
    // Someone else already sharing — avoid stacking two shares. Checked on
    // the publication so a share we have not finished subscribing to still
    // counts.
    for (const p of room.remoteParticipants.values()) {
      if (p.getTrackPublication(Track.Source.ScreenShare)) {
        emitToast(`${p.name || p.identity} is already sharing`);
        return;
      }
    }
    // RN Android getDisplayMedia is video-only; mic stays a separate LiveKit track.
    room.localParticipant
      .setScreenShareEnabled(true, { audio: false, contentHint: 'motion' })
      .then(
        async () => {
          isScreenSharingRef.current = true;
          setIsScreenSharing(true);
          setVoiceScreenSharing(true);
          // Keep mic live while sharing so voice continues alongside the video.
          if (
            !isMutedRef.current &&
            !isPushToTalkRef.current &&
            !isHostMutedRef.current &&
            room.localParticipant.permissions?.canPublish !== false
          ) {
            try {
              await room.localParticipant.setMicrophoneEnabled(true);
              attachVoiceChanger();
            } catch (err) {
              console.warn('re-enable mic during screen share failed:', err);
            }
          }
          refreshScreenShare(room);
          emitToast('Sharing screen — others in this voice call can see it');
        },
        (err: unknown) => {
          console.warn('start screen share failed:', err);
          const name =
            err && typeof err === 'object' && 'name' in err
              ? String((err as { name?: unknown }).name ?? '')
              : '';
          const message =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message?: unknown }).message ?? '')
              : '';
          const denied =
            name === 'NotAllowedError' ||
            /NotAllowed/i.test(message) ||
            /PermissionDenied/i.test(message) ||
            /permission/i.test(message);
          emitToast(
            denied
              ? 'Screen share blocked — tap Allow on the Android share prompt'
              : message || 'Could not start screen share',
          );
        },
      );
  }, [status, refreshScreenShare]);

  const togglePushToTalk = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setIsPushToTalk((prev) => {
      const nextPTT = !prev;
      isPushToTalkRef.current = nextPTT;
      if (nextPTT) {
        // Entering PTT mode: mute mic immediately
        room.localParticipant.setMicrophoneEnabled(false);
        setIsMuted(true);
      } else {
        // Leaving PTT mode: restore mic (unless host-muted)
        if (!isHostMutedRef.current) {
          room.localParticipant.setMicrophoneEnabled(true);
          setIsMuted(false);
        }
      }
      return nextPTT;
    });
  }, []);

  const pttStart = useCallback(() => {
    const room = roomRef.current;
    if (!room || !isPushToTalkRef.current) return;
    if (isHostMutedRef.current) {
      emitToast('A host muted you. Raise your hand to ask for the mic.');
      return;
    }
    room.localParticipant.setMicrophoneEnabled(true);
    setIsMuted(false);
  }, []);

  const pttStop = useCallback(() => {
    const room = roomRef.current;
    if (!room || !isPushToTalkRef.current) return;
    room.localParticipant.setMicrophoneEnabled(false);
    setIsMuted(true);
  }, []);

  // Keep voice alive in background — WebRTC audio runs natively, we just
  // prevent any JS-side auto-disconnect logic from firing.
  useEffect(() => {
    const handleAppState = (_nextState: AppStateStatus) => {
      // Intentionally no-op: do not disconnect when backgrounded.
      // On iOS, UIBackgroundModes audio+voip (in app.config.ts) keeps the
      // process alive. On Android, the native WebRTC module keeps audio running.
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // The hook lives in VoiceContext; unmount == deactivate (or switching
  // team <-> guild). Never leave the mic / room connection behind.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      roomRef.current = null;
      stopVoiceBackground();
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, []);

  // Android: keep the mic + socket alive when the user switches to their
  // game, and show the ongoing-call notification with Mute/Deafen/Leave
  // quick actions. Re-runs on every mute/deafen toggle to keep those
  // buttons' labels in sync with actual state.
  useEffect(() => {
    if (status !== 'connected' && status !== 'connecting') return;
    startVoiceBackground(
      isGuild ? 'Guild Voice' : 'Team Voice',
      'You are in voice. Tap to return to the voice channel.',
      { muted: isMuted, deafened: isDeafened, room: isGuild ? 'guild' : 'team' },
    );
  }, [status, isMuted, isDeafened, isGuild]);

  // Mute / Deafen / Leave tapped on the notification itself (app backgrounded).
  useEffect(() => {
    return addVoiceNotificationActionListener((action) => {
      if (action === 'mute') toggleMute();
      else if (action === 'deafen') toggleDeafen();
      else if (action === 'leave') leave();
    });
  }, [toggleMute, toggleDeafen, leave]);

  const roomCount =
    status === 'connected' ? participants.length + 1 : undefined;
  const canModerate = !!options.canModerate;
  const roomMax = options.max;
  const isListenOnly = roomState.listenOnly;

  // Stable identity until something actually changes: VoiceProvider stores
  // this in state, so a fresh object per render looped forever (app hang).
  return useMemo<VoiceChannelController>(
    () => ({
      status,
      errorMessage,
      participants,
      isMuted,
      isLocalHandRaised,
      isDeafened,
      isPushToTalk,
      isScreenSharing,
      screenShare,
      join,
      leave,
      toggleMute,
      toggleScreenShare,
      toggleParticipantMute,
      toggleHandRaise,
      setParticipantVolume,
      kickParticipant,
      toggleDeafen,
      togglePushToTalk,
      pttStart,
      pttStop,
      room: voiceRoom,
      roomCount,
      roomMax,
      ...(isGuild
        ? {
            canModerate,
            isHostMuted,
            isListenOnly,
            muteAll,
            unmuteAll,
            setParticipantHostMuted,
          }
        : {}),
    }),
    [
      status,
      errorMessage,
      participants,
      isMuted,
      isLocalHandRaised,
      isDeafened,
      isPushToTalk,
      isScreenSharing,
      screenShare,
      join,
      leave,
      toggleMute,
      toggleScreenShare,
      toggleParticipantMute,
      toggleHandRaise,
      setParticipantVolume,
      kickParticipant,
      toggleDeafen,
      togglePushToTalk,
      pttStart,
      pttStop,
      isGuild,
      voiceRoom,
      canModerate,
      isHostMuted,
      isListenOnly,
      roomCount,
      roomMax,
      muteAll,
      unmuteAll,
      setParticipantHostMuted,
    ],
  );
}
