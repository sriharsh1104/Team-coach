import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { VoiceChannelController } from './types';

export type VoiceActivation =
  // Hosted (LiveKit): url + room token from GET /voice/config.
  | {
      mode: 'hosted';
      url: string;
      token: string;
      room?: 'team' | 'guild';
      canModerate?: boolean;
      max?: number;
    }
  // Self-hosted (mediasoup): our own API JWT for the /voice socket.
  | { mode: 'self'; token: string; room?: 'team' | 'guild' };

type VoiceContextValue = {
  /** Currently active controller, or null when not in a voice session. */
  controller: VoiceChannelController | null;
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
  room: 'team' | 'guild';
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
      // Same session already active → keep it (and its connection) as-is.
      if (
        prev &&
        prev.mode === config.mode &&
        prev.token === config.token &&
        (prev.room ?? 'team') === (config.room ?? 'team')
      ) {
        if (prev.mode === 'hosted' && config.mode === 'hosted' && prev.url !== config.url) {
          return config;
        }
        return prev;
      }
      return config;
    });
  }, []);

  const deactivate = useCallback(() => {
    // Leave the voice channel before removing the holder
    controllerRef.current?.leave();
    setActivation(null);
    setController(null);
    controllerRef.current = null;
  }, []);

  return (
    <VoiceContext.Provider
      value={{ controller, isScreenFocused, activate, deactivate, setScreenFocused }}
    >
      {activation?.mode === 'hosted' ? (
        <HostedVoiceHolder
          key={`hosted:${activation.room ?? 'team'}:${activation.url}:${activation.token}`}
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
