import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { VoiceChannelScreen } from '../VoiceChannelScreen';
import * as voiceApi from '../../../api/voice';
import { useHostedVoiceChannel } from '../../../voice/useHostedVoiceChannel';
import { useSelfHostedVoiceChannel } from '../../../voice/useSelfHostedVoiceChannel';
import { TOKEN_STORAGE_KEY } from '../../../api/client';

jest.mock('../../../api/voice');
// The hooks own all the WebRTC/mediasoup/LiveKit wiring; VoiceChannelScreen's
// own logic is just: pick a mode, then render idle/connecting/error/connected
// off whatever the hook returns. Testing that doesn't need real signaling.
jest.mock('../../../voice/useHostedVoiceChannel');
jest.mock('../../../voice/useSelfHostedVoiceChannel');

const mockedVoiceApi = voiceApi as jest.Mocked<typeof voiceApi>;
const mockedUseHosted = useHostedVoiceChannel as jest.Mock;
const mockedUseSelfHosted = useSelfHostedVoiceChannel as jest.Mock;

function controller(overrides: Partial<any> = {}) {
  return {
    status: 'idle',
    errorMessage: undefined,
    participants: [],
    isMuted: false,
    join: jest.fn(),
    leave: jest.fn(),
    toggleMute: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseHosted.mockReturnValue(controller());
  mockedUseSelfHosted.mockReturnValue(controller());
});

describe('VoiceChannelScreen', () => {
  it('shows a loading indicator until config and token are both available', async () => {
    mockedVoiceApi.getVoiceConfig.mockReturnValue(new Promise(() => {}));
    render(<VoiceChannelScreen />);

    expect(screen.queryByText('Team Voice')).toBeNull();
  });

  it('shows an error message when loading the voice config fails', async () => {
    mockedVoiceApi.getVoiceConfig.mockRejectedValue({
      response: { data: { message: 'Voice is not configured for this org' } },
    });
    render(<VoiceChannelScreen />);

    await screen.findByText('Voice is not configured for this org');
  });

  it('shows a sign-in-again error instead of hanging when there is no stored auth token', async () => {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    render(<VoiceChannelScreen />);

    await screen.findByText('You are signed out. Please log in again to use voice channels.');
    expect(screen.queryByText('Team Voice')).toBeNull();
    expect(mockedUseSelfHosted).not.toHaveBeenCalled();
  });

  it('uses the self-hosted hook with the stored token when mode is "self"', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    render(<VoiceChannelScreen />);

    await screen.findByText('Team Voice');
    expect(mockedUseSelfHosted).toHaveBeenCalledWith('token-abc');
    expect(mockedUseHosted).not.toHaveBeenCalled();
  });

  it('uses the hosted hook with the LiveKit url/token when mode is "hosted"', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({
      mode: 'hosted',
      url: 'wss://livekit.example.com',
      token: 'lk-token',
    });
    render(<VoiceChannelScreen />);

    await screen.findByText('Team Voice');
    expect(mockedUseHosted).toHaveBeenCalledWith('wss://livekit.example.com', 'lk-token');
    expect(mockedUseSelfHosted).not.toHaveBeenCalled();
  });

  it('shows a Join button when idle, and calls join when pressed', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    const joinSpy = jest.fn();
    mockedUseSelfHosted.mockReturnValue(controller({ join: joinSpy }));
    render(<VoiceChannelScreen />);

    const joinButton = await screen.findByText('Join Voice Channel');
    fireEvent.press(joinButton);

    expect(joinSpy).toHaveBeenCalled();
  });

  it('shows a connecting indicator while status is "connecting"', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(controller({ status: 'connecting' }));
    render(<VoiceChannelScreen />);

    await screen.findByText('Connecting…');
    expect(screen.queryByText('Join Voice Channel')).toBeNull();
  });

  it('shows the hook\'s error message when status is "error"', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(
      controller({ status: 'error', errorMessage: 'Microphone permission denied' }),
    );
    render(<VoiceChannelScreen />);

    await screen.findByText('Microphone permission denied');
  });

  it('shows participants, mute toggle, and leave button when connected', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    const toggleMuteSpy = jest.fn();
    const leaveSpy = jest.fn();
    mockedUseSelfHosted.mockReturnValue(
      controller({
        status: 'connected',
        participants: [{ id: 'p1', name: 'Teammate' }],
        toggleMute: toggleMuteSpy,
        leave: leaveSpy,
      }),
    );
    render(<VoiceChannelScreen />);

    await screen.findByText('● Connected');
    expect(screen.getByText('Teammate')).toBeTruthy();

    fireEvent.press(screen.getByText('Mute'));
    expect(toggleMuteSpy).toHaveBeenCalled();

    fireEvent.press(screen.getByText('Leave Channel'));
    expect(leaveSpy).toHaveBeenCalled();
  });

  it('shows "Unmute" when already muted', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(controller({ status: 'connected', isMuted: true }));
    render(<VoiceChannelScreen />);

    await screen.findByText('Unmute');
  });

  it('shows the empty-channel message when connected with no other participants', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedUseSelfHosted.mockReturnValue(controller({ status: 'connected', participants: [] }));
    render(<VoiceChannelScreen />);

    await screen.findByText('No one else is in the channel yet.');
  });
});
