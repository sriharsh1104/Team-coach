import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { VoiceChannelScreen } from '../VoiceChannelScreen';
import { VoiceProvider } from '../../../voice/VoiceContext';
import * as voiceApi from '../../../api/voice';
import { useHostedVoiceChannel } from '../../../voice/useHostedVoiceChannel';
import { useSelfHostedVoiceChannel } from '../../../voice/useSelfHostedVoiceChannel';
import { useAuth } from '../../../auth/AuthContext';
import { TOKEN_STORAGE_KEY } from '../../../api/client';

// useFocusEffect requires a React Navigation navigator in the tree; in tests
// we substitute a plain useEffect so HostedVoiceChannel doesn't throw.
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      React.useEffect(cb, []);
    },
  };
});

jest.mock('../../../api/voice');
jest.mock('../../../voice/useHostedVoiceChannel');
jest.mock('../../../voice/useSelfHostedVoiceChannel');
jest.mock('../../../auth/AuthContext');

function renderWithVoice(ui: React.ReactElement) {
  return render(<VoiceProvider>{ui}</VoiceProvider>);
}

const mockedVoiceApi = voiceApi as jest.Mocked<typeof voiceApi>;
const mockedUseHosted = useHostedVoiceChannel as jest.Mock;
const mockedUseSelfHosted = useSelfHostedVoiceChannel as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;

function controller(overrides: Partial<any> = {}) {
  return {
    status: 'idle',
    errorMessage: undefined,
    participants: [],
    isMuted: false,
    join: jest.fn(),
    leave: jest.fn(),
    toggleMute: jest.fn(),
    toggleParticipantMute: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    user: { id: 'me', name: 'Player One' },
  });
  mockedUseHosted.mockReturnValue(controller());
  mockedUseSelfHosted.mockReturnValue(controller());
});

describe('VoiceChannelScreen', () => {
  it('shows a loading indicator until config and token are both available', async () => {
    mockedVoiceApi.getVoiceConfig.mockReturnValue(new Promise(() => {}));
    renderWithVoice(<VoiceChannelScreen />);

    expect(screen.queryByText('Team Voice')).toBeNull();
  });

  it('shows an error message when loading the voice config fails', async () => {
    mockedVoiceApi.getVoiceConfig.mockRejectedValue({
      response: { data: { message: 'Voice is not configured for this org' } },
    });
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Voice is not configured for this org');
  });

  it('shows a sign-in-again error instead of hanging when there is no stored auth token', async () => {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('You are signed out. Please log in again to use voice channels.');
    expect(screen.queryByText('Team Voice')).toBeNull();
    expect(mockedUseSelfHosted).not.toHaveBeenCalled();
  });

  it('uses the self-hosted hook with the stored token when mode is "self"', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Team Voice');
    expect(mockedUseSelfHosted).toHaveBeenCalledWith('token-abc');
    expect(mockedUseHosted).not.toHaveBeenCalled();
  });

  it('uses the hosted hook with the LiveKit url/token when mode is "hosted"', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({
      mode: 'hosted',
      url: 'wss://livekit.example.com',
      token: 'lk-token',
    });
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Team Voice');
    expect(mockedUseHosted).toHaveBeenCalledWith('wss://livekit.example.com', 'lk-token');
    expect(mockedUseSelfHosted).not.toHaveBeenCalled();
  });

  it('shows an empty channel with Join when idle', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    const joinSpy = jest.fn();
    mockedUseSelfHosted.mockReturnValue(controller({ join: joinSpy }));
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Empty — join to talk with your team');
    fireEvent.press(screen.getByText('Join Voice Channel'));
    expect(joinSpy).toHaveBeenCalled();
  });

  it('shows a connecting indicator while status is "connecting"', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(controller({ status: 'connecting' }));
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Connecting…');
    expect(screen.queryByText('Join Voice Channel')).toBeNull();
  });

  it('shows the hook\'s error message when status is "error"', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(
      controller({ status: 'error', errorMessage: 'Microphone permission denied' }),
    );
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Microphone permission denied');
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('shows self + others, mic mute, and Disconnect when connected', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    const toggleMuteSpy = jest.fn();
    const leaveSpy = jest.fn();
    mockedUseSelfHosted.mockReturnValue(
      controller({
        status: 'connected',
        participants: [{ id: 'p1', name: 'Teammate', isLocallyMuted: false }],
        toggleMute: toggleMuteSpy,
        leave: leaveSpy,
      }),
    );
    renderWithVoice(<VoiceChannelScreen />);

    // Bottom bar buttons use accessibilityLabel, not visible text
    await screen.findByLabelText('Disconnect');
    expect(screen.getByText('2 connected')).toBeTruthy();
    expect(screen.getByText('Player One (You)')).toBeTruthy();
    expect(screen.getByText('Teammate')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Mute mic'));
    expect(toggleMuteSpy).toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Disconnect'));
    expect(leaveSpy).toHaveBeenCalled();
  });

  it('shows Unmute mic label when already self-muted', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(controller({ status: 'connected', isMuted: true }));
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByLabelText('Unmute mic');
  });

  it('shows "Muted for you" when a participant is locally muted', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(
      controller({
        status: 'connected',
        participants: [{ id: 'p1', name: 'Teammate', isLocallyMuted: true }],
      }),
    );
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Muted for you');
  });
});
