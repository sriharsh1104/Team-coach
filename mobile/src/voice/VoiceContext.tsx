import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { VoiceChannelController, VoiceRoomKind } from './types';

export type VoiceActivation =
  // Hosted (LiveKit): url + room token from GET /voice/config.
  | {
      mode: 'hosted';
      url: string;
      token: string;
      room?: VoiceRoomKind;
      canModerate?: boolean;
      max?: number;
      /**
       * 1-on-1 only. Carried on the activation so two different direct calls
       * are told apart below — same room kind, different conversation.
       */
      peerId?: string;
      peerName?: string;
    }
  // Self-hosted (mediasoup): our own API JWT for the /voice socket.
  | { mode: 'self'; token: string; room?: 'team' | 'guild' };

type VoiceContextValue = {
  /** Currently active controller, or null when not in a voice session. */
  controller: VoiceChannelController | null;
  /**
   * Room the provider is actually holding (may differ from the screen the
   * user just opened when a live call blocks team ↔ guild switch).
   */
  activationRoom: VoiceRoomKind | null;
  /** 1-on-1 peer id from the live activation (for reopening DirectVoice). */
  activationPeerId: string | null;
  /** 1-on-1 peer display name from the live activation. */
  activationPeerName: string | null;
  /** Whether the voice screen is currently focused (user is looking at it). */
  isScreenFocused: boolean;
  /** Activate a voice session with the given config. */
  activate: (config: VoiceActivation) => void;
  /** Deactivate and disconnect — called when user leaves voice entirely. */
  deactivate: () => void;
  /** Mark whether the voice screen is focused (to decide when to show widget). */
  setScreenFocused: (focused: boolean) => void;
};

const VoiceContext = createContext<VoiceContextValue>({
  controller: null,
  activationRoom: null,
  activationPeerId: null,
  activationPeerName: null,
  isScreenFocused: false,
  activate: () => {},
  deactivate: () => {},
  setScreenFocused: () => {},
});

export const useVoiceContext = () => useContext(VoiceContext);

/**
 * Internal: a component that calls the hosted voice hook and feeds its
 * controller back through the ref. Mounted only while a hosted session is
 * active; stays mounted across screen navigation.
 */
// memo: the provider re-renders whenever the controller changes; without it the
// holder re-ran its hook on every one of those renders.
const HostedVoiceHolder = React.memo(function HostedVoiceHolder({
  url,
  token,
  room,
  canModerate,
  max,
  onController,
}: {
  url: string;
  token: string;
  room: VoiceRoomKind;
  canModerate?: boolean;
  max?: number;
  onController: (c: VoiceChannelController) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useHostedVoiceChannel } = require('./useHostedVoiceChannel') as {
    useHostedVoiceChannel: typeof import('./useHostedVoiceChannel').useHostedVoiceChannel;
  };
  const controller = useHostedVoiceChannel(url, token, { room, canModerate, max });

  // Feed the controller up only when it changes. With no deps this ran after
  // every render → setState in the provider → re-render → infinite loop.
  useEffect(() => {
    onController(controller);
  }, [controller, onController]);

  return null;
});

/**
 * Same idea for the self-hosted (mediasoup) path. Before this existed the
 * self-hosted hook lived inside VoiceChannelScreen, so navigating away
 * unmounted it without closing the socket or the mic — the session leaked
 * and "Join" on return opened a second one.
 */
const SelfHostedVoiceHolder = React.memo(function SelfHostedVoiceHolder({
  token,
  room,
  onController,
}: {
  token: string;
  room: 'team' | 'guild';
  onController: (c: VoiceChannelController) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useSelfHostedVoiceChannel } = require('./useSelfHostedVoiceChannel') as {
    useSelfHostedVoiceChannel: typeof import('./useSelfHostedVoiceChannel').useSelfHostedVoiceChannel;
  };
  const controller = useSelfHostedVoiceChannel(token, room);

  useEffect(() => {
    onController(controller);
  }, [controller, onController]);

  return null;
});

/**
 * Global voice provider — wraps the entire app so the voice connection
 * persists across screen navigation. VoiceChannelScreen sets the activation
 * config; this provider mounts the matching holder (which owns the LiveKit
 * Room / mediasoup session) in the app root above the navigator so it never
 * unmounts when the user navigates away.
 */
export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [activation, setActivation] = useState<VoiceActivation | null>(null);
  const [controller, setController] = useState<VoiceChannelController | null>(null);
  const [isScreenFocused, setScreenFocused] = useState(false);
  const controllerRef = useRef<VoiceChannelController | null>(null);

  const handleController = useCallback((c: VoiceChannelController) => {
    controllerRef.current = c;
    setController(c);
  }, []);

  const activate = useCallback((config: VoiceActivation) => {
    setActivation((prev) => {
      const nextRoom = config.room ?? 'team';
      const prevRoom = prev?.room ?? 'team';
      const live = controllerRef.current?.status;
      const inCall = live === 'connected' || live === 'connecting';

      // Opening Team Voice while already in Guild Voice (or the reverse)
      // used to remount the holder and silently drop everyone from the call.
      // Keep the live session; the voice screen shows Leave & Switch instead.
      if (prev && inCall && (prev.mode !== config.mode || prevRoom !== nextRoom)) {
        return prev;
      }

      if (prev && prev.mode === config.mode && prevRoom === nextRoom) {
        // A different LiveKit server / room → new session.
        if (prev.mode === 'hosted' && config.mode === 'hosted' && prev.url !== config.url) {
          return config;
        }
        // Same "direct" kind but a different person is a different call.
        if (
          prev.mode === 'hosted' &&
          config.mode === 'hosted' &&
          nextRoom === 'direct' &&
          prev.peerId !== config.peerId
        ) {
          return config;
        }
        if (prev.token === config.token) return prev;
        // Same room but a freshly minted token (the voice screen re-fetches
        // /voice/config every time it opens, and hosted tokens are new JWTs
        // each call). Swapping the token remounts the holder, which drops the
        // call and shows "Join" again. While the user is in (or joining) the
        // call keep the live session; only pick up the new token once idle.
        if (inCall) {
          if (
            prev.mode === 'hosted' &&
            config.mode === 'hosted' &&
            (prev.canModerate !== config.canModerate || prev.max !== config.max)
          ) {
            return { ...config, token: prev.token };
          }
          return prev;
        }
      }
      return config;
    });
  }, []);

  /**
   * A session that was live and has gone back to idle has ended for good:
   * the user tapped Leave on the voice screen, a host removed them, the same
   * account joined from another device (LiveKit's identity is the user id, so
   * the older device is kicked with DUPLICATE_IDENTITY), or the reconnect
   * window ran out. The hooks reset their own state, but the provider used to
   * keep the holder mounted around a dead Room — leaving a zombie controller
   * behind the floating widget and the voice screen. Drop the activation so
   * the next Join starts from a clean session.
   */
  const wasLiveRef = useRef(false);
  useEffect(() => {
    if (!controller) {
      wasLiveRef.current = false;
      return;
    }
    if (controller.status === 'connected' || controller.status === 'connecting') {
      wasLiveRef.current = true;
      return;
    }
    // 'error' keeps the holder so the screen can offer Try Again.
    if (wasLiveRef.current && controller.status === 'idle') {
      wasLiveRef.current = false;
      setActivation(null);
      setController(null);
      controllerRef.current = null;
    }
  }, [controller]);

  const deactivate = useCallback(() => {
    // Leave the voice channel before removing the holder
    controllerRef.current?.leave();
    setActivation(null);
    setController(null);
    controllerRef.current = null;
  }, []);

  const activationRoom = activation ? (activation.room ?? 'team') : null;
  const activationPeerId =
    activation?.mode === 'hosted' && activation.peerId
      ? activation.peerId
      : null;
  const activationPeerName =
    activation?.mode === 'hosted' && activation.peerName
      ? activation.peerName
      : null;

  return (
    <VoiceContext.Provider
      value={{
        controller,
        activationRoom,
        activationPeerId,
        activationPeerName,
        isScreenFocused,
        activate,
        deactivate,
        setScreenFocused,
      }}
    >
      {activation?.mode === 'hosted' ? (
        <HostedVoiceHolder
          key={`hosted:${activation.room ?? 'team'}:${activation.peerId ?? ''}:${activation.url}:${activation.token}`}
          url={activation.url}
          token={activation.token}
          room={activation.room ?? 'team'}
          canModerate={activation.canModerate}
          max={activation.max}
          onController={handleController}
        />
      ) : null}
      {activation?.mode === 'self' ? (
        <SelfHostedVoiceHolder
          key={`self:${activation.room ?? 'team'}:${activation.token}`}
          token={activation.token}
          room={activation.room ?? 'team'}
          onController={handleController}
        />
      ) : null}
      {children}
    </VoiceContext.Provider>
  );
}
