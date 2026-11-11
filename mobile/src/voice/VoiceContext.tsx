import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { VoiceChannelController, VoiceChannelStatus } from './types';

export type VoiceActivation = {
  mode: 'hosted' | 'self';
  url: string;
  token: string;
};

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
function HostedVoiceHolder({
  url,
  token,
  onController,
}: {
  url: string;
  token: string;
  onController: (c: VoiceChannelController) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useHostedVoiceChannel } = require('./useHostedVoiceChannel') as {
    useHostedVoiceChannel: typeof import('./useHostedVoiceChannel').useHostedVoiceChannel;
  };
  const controller = useHostedVoiceChannel(url, token);

  // Feed the controller up to the provider
  useEffect(() => {
    onController(controller);
  });

  return null;
}

/**
 * Global voice provider — wraps the entire app so the voice connection
 * persists across screen navigation. VoiceChannelScreen sets the activation
 * config; this provider mounts HostedVoiceHolder (which holds the LiveKit
 * Room) in the app root above the navigator so it never unmounts when the
 * user navigates away.
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
    setActivation(config);
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
          key={`${activation.url}:${activation.token}`}
          url={activation.url}
          token={activation.token}
          onController={handleController}
        />
      ) : null}
      {children}
    </VoiceContext.Provider>
  );
}
