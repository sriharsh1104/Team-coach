import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { VoiceChannelScreen, GuildVoiceScreen } from '../VoiceChannelScreen';
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
  mockedVoiceApi.getVoiceOccupancy.mockResolvedValue({
    room: 'team',
    max: 5,
    count: 0,
    participants: [],
  });
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
    expect(mockedUseSelfHosted).toHaveBeenCalledWith('token-abc', 'team');
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
    expect(mockedUseHosted).toHaveBeenCalledWith('wss://livekit.example.com', 'lk-token', {
      room: 'team',
      canModerate: undefined,
      max: undefined,
    });
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

  it('shows who is already in voice on the lobby before joining', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
    mockedVoiceApi.getVoiceOccupancy.mockResolvedValue({
      room: 'team',
      max: 5,
      count: 2,
      participants: [
        { id: 'u2', name: 'Bob', avatarUrl: null },
        { id: 'u3', name: 'Cara', avatarUrl: null },
      ],
    });
    mockedUseSelfHosted.mockReturnValue(controller());
    renderWithVoice(<VoiceChannelScreen />);

    await screen.findByText('Already In Voice');
    expect(screen.getByText('2 / 5 already in voice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Cara')).toBeTruthy();
    expect(screen.getByText('Join Voice Channel')).toBeTruthy();
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

describe('GuildVoiceScreen', () => {
  const guildController = (overrides: Partial<any> = {}) =>
    controller({
      room: 'guild',
      status: 'connected',
      roomCount: 3,
      roomMax: 50,
      canModerate: false,
      isHostMuted: false,
      isListenOnly: false,
      participants: [
        {
          id: 'p1',
          name: 'Teammate',
          isLocallyMuted: false,
          isHostMuted: false,
          isModerator: false,
        },
      ],
      ...overrides,
    });

  beforeEach(async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({ mode: 'self' });
  });

  it('joins the guild room and shows the 50-person capacity', async () => {
    mockedUseSelfHosted.mockReturnValue(guildController());
    renderWithVoice(<GuildVoiceScreen />);

    await screen.findByText('Guild Voice');
    expect(mockedUseSelfHosted).toHaveBeenCalledWith('token-abc', 'guild');
    await screen.findByText('3 / 50 in voice');
  });

  it('joins the hosted (LiveKit) guild room with the server-provided host flag and cap', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-abc');
    mockedVoiceApi.getVoiceConfig.mockResolvedValue({
      mode: 'hosted',
      url: 'wss://livekit.example.com',
      token: 'lk-guild-token',
      room: 'guild',
      canModerate: true,
      max: 50,
    });
    mockedUseHosted.mockReturnValue(
      controller({
        room: 'guild',
        status: 'connected',
        canModerate: true,
        roomCount: 4,
        roomMax: 50,
        muteAll: jest.fn(),
        unmuteAll: jest.fn(),
        setParticipantHostMuted: jest.fn(),
      }),
    );
    renderWithVoice(<GuildVoiceScreen />);

    await screen.findByText('Guild Voice');
    expect(mockedVoiceApi.getVoiceConfig).toHaveBeenCalledWith('guild');
    expect(mockedUseHosted).toHaveBeenCalledWith('wss://livekit.example.com', 'lk-guild-token', {
      room: 'guild',
      canModerate: true,
      max: 50,
    });
    expect(mockedUseSelfHosted).not.toHaveBeenCalled();
    await screen.findByText('4 / 50 in voice');
    expect(screen.queryByText(/needs the self-hosted voice server/)).toBeNull();
  });

  it('hides host controls from regular members', async () => {
    mockedUseSelfHosted.mockReturnValue(guildController());
    renderWithVoice(<GuildVoiceScreen />);

    await screen.findByText('Teammate');
    expect(screen.queryByText('Mute all')).toBeNull();
    expect(screen.queryByLabelText('Mute Teammate for everyone')).toBeNull();
    expect(screen.queryByLabelText('Kick Teammate')).toBeNull();
  });

  it('lets a host mute all, unmute all and mute one person', async () => {
    const muteAll = jest.fn();
    const unmuteAll = jest.fn();
    const setParticipantHostMuted = jest.fn();
    mockedUseSelfHosted.mockReturnValue(
      guildController({ canModerate: true, muteAll, unmuteAll, setParticipantHostMuted }),
    );
    renderWithVoice(<GuildVoiceScreen />);

    fireEvent.press(await screen.findByText('Mute all'));
    expect(muteAll).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Unmute all'));
    expect(unmuteAll).toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Mute Teammate for everyone'));
    expect(setParticipantHostMuted).toHaveBeenCalledWith('p1', true);
  });

  it('offers unmute for a person a host muted, and never offers mute on another host', async () => {
    const setParticipantHostMuted = jest.fn();
    mockedUseSelfHosted.mockReturnValue(
      guildController({
        canModerate: true,
        setParticipantHostMuted,
        participants: [
          { id: 'p1', name: 'Teammate', isLocallyMuted: false, isHostMuted: true, isModerator: false },
          { id: 'h2', name: 'Leader', isLocallyMuted: false, isHostMuted: false, isModerator: true },
        ],
      }),
    );
    renderWithVoice(<GuildVoiceScreen />);

    await screen.findByText('Muted by host');
    fireEvent.press(screen.getByLabelText('Unmute Teammate for everyone'));
    expect(setParticipantHostMuted).toHaveBeenCalledWith('p1', false);
    expect(screen.queryByLabelText('Mute Leader for everyone')).toBeNull();
    expect(screen.queryByLabelText('Kick Leader')).toBeNull();
  });

  it('tells a muted member they were muted and shows the mic as locked', async () => {
    mockedUseSelfHosted.mockReturnValue(guildController({ isHostMuted: true }));
    renderWithVoice(<GuildVoiceScreen />);

    await screen.findByText('A host muted you.');
    expect(screen.getByLabelText('Muted by host')).toBeTruthy();
  });

  it('shows the listen-only banner to everyone', async () => {
    mockedUseSelfHosted.mockReturnValue(guildController({ isListenOnly: true, isHostMuted: true }));
    renderWithVoice(<GuildVoiceScreen />);

    await screen.findByText('Listen-only mode — only hosts can speak right now.');
  });
});

