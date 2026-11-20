import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GamesHubScreen } from '../GamesHubScreen';
import { GameRoomScreen } from '../GameRoomScreen';
import { useGamesSocket } from '../../../games/useGamesSocket';
import { useAuth } from '../../../auth/AuthContext';
import * as orgApi from '../../../api/org';
import type { RoomView } from '../../../api/games';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, unknown> = {};
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (cb: () => (() => void) | void) => {
      React.useEffect(cb, []);
    },
  };
});
jest.mock('../../../games/useGamesSocket', () => {
  const actual = jest.requireActual('../../../games/useGamesSocket');
  return { ...actual, useGamesSocket: jest.fn() };
});
jest.mock('../../../auth/AuthContext');
jest.mock('../../../api/org');

const mockedSocket = useGamesSocket as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedOrg = orgApi as jest.Mocked<typeof orgApi>;

function api(overrides: Partial<ReturnType<typeof useGamesSocket>> = {}) {
  return {
    connected: true,
    latestRoom: () => null,
    listRooms: jest.fn().mockResolvedValue([]),
    currentRoom: jest.fn().mockResolvedValue(null),
    createRoom: jest.fn(),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn().mockResolvedValue(null),
    startGame: jest.fn(),
    rematch: jest.fn(),
    invite: jest.fn().mockResolvedValue(null),
    members: jest.fn().mockResolvedValue([]),
    inviteAll: jest.fn().mockResolvedValue({ sentIds: [], skippedIds: [], total: 0 }),
    rpsPick: jest.fn(),
    ludoRoll: jest.fn(),
    ludoMove: jest.fn(),
    ...overrides,
  };
}

function lobbyRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    id: 'r1',
    orgId: 'org',
    game: 'rps',
    title: 'Stone Paper Scissors',
    hostId: 'me',
    status: 'lobby',
    players: [{ userId: 'me', name: 'Me', avatarUrl: null, seat: 0, connected: true }],
    minPlayers: 2,
    maxPlayers: 2,
    createdAt: Date.now(),
    rps: null,
    ludo: null,
    deadline: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ user: { id: 'me', name: 'Me' } });
  mockedOrg.getMyOrg.mockResolvedValue({ members: [] } as any);
  mockRouteParams = {};
});

describe('GamesHubScreen', () => {
  it('lists both games and joins an open room', async () => {
    const joinRoom = jest.fn().mockResolvedValue(lobbyRoom({ hostId: 'other' }));
    mockedSocket.mockReturnValue(
      api({
        joinRoom,
        listRooms: jest.fn().mockResolvedValue([
          lobbyRoom({
            id: 'open1',
            hostId: 'other',
            players: [{ userId: 'other', name: 'Riya', avatarUrl: null, seat: 0, connected: true }],
          }),
        ]),
      }),
    );
    render(<GamesHubScreen />);
    expect(screen.getByText('Stone Paper Scissors')).toBeTruthy();
    expect(screen.getByText('Ludo')).toBeTruthy();
    await screen.findByText(/Riya · 1\/2 players/);
    fireEvent.press(screen.getByLabelText('Join Stone Paper Scissors'));
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith('open1'));
    expect(mockNavigate).toHaveBeenCalledWith('GameRoom', { roomId: 'r1', game: 'rps' });
  });

  it('asks before leaving a running game to start or join another room', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    const createRoom = jest.fn().mockResolvedValue(lobbyRoom({ id: 'r2' }));
    mockedSocket.mockReturnValue(
      api({
        createRoom,
        currentRoom: jest.fn().mockResolvedValue(lobbyRoom({ id: 'busy', status: 'playing' })),
      }),
    );
    render(<GamesHubScreen />);
    await screen.findByText(/Game in progress/);

    fireEvent.press(screen.getByLabelText('Create Stone Paper Scissors room'));
    expect(createRoom).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Leave your running game?',
      expect.stringContaining('forfeit'),
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find((b) => b.text === 'Leave & continue')!.onPress!();
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith('rps', 2));
    alertSpy.mockRestore();
  });

  it('creates an RPS room straight away (no player-count prompt for 2-player games)', async () => {
    const createRoom = jest.fn().mockResolvedValue(lobbyRoom());
    mockedSocket.mockReturnValue(api({ createRoom }));
    render(<GamesHubScreen />);
    fireEvent.press(screen.getByLabelText('Create Stone Paper Scissors room'));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith('rps', 2));
    expect(mockNavigate).toHaveBeenCalledWith('GameRoom', { roomId: 'r1', game: 'rps' });
  });
});

describe('GameRoomScreen', () => {
  it('lobby: host sees players, invite list, and a disabled Start until enough players', async () => {
    mockRouteParams = { roomId: 'r1', game: 'rps' };
    const invite = jest.fn().mockResolvedValue(null);
    const inviteAll = jest.fn().mockResolvedValue({ sentIds: ['u2'], skippedIds: [], total: 1 });
    mockedSocket.mockReturnValue(api({
      joinRoom: jest.fn().mockResolvedValue(lobbyRoom()),
      invite,
      members: jest.fn().mockResolvedValue([{ userId: 'u2', name: 'Arjun', avatarUrl: null }]),
      inviteAll,
    }));
    render(<GameRoomScreen />);
    await screen.findByText('Me (You)');
    expect(screen.getByText('Need 1 more')).toBeTruthy();
    await screen.findByText('Arjun');
    fireEvent.press(screen.getByLabelText('Notify Arjun'));
    await waitFor(() => expect(invite).toHaveBeenCalledWith('r1', 'u2'));
    await screen.findByLabelText('Notified Arjun');
    expect(screen.getByLabelText('Invite via WhatsApp')).toBeTruthy();
    expect(screen.getByLabelText('Invite via Discord')).toBeTruthy();
    expect(screen.getByLabelText('Invite via Telegram')).toBeTruthy();
    // Cooldown: the bell stays disabled right after notifying.
    expect(screen.queryByLabelText('Notify Arjun')).toBeNull();
    fireEvent.press(screen.getByLabelText('Notify all teammates'));
    await waitFor(() => expect(inviteAll).toHaveBeenCalledWith('r1'));
  });

  it('playing RPS: shows scores/round, sends my pick, and disables picks once picked', async () => {
    mockRouteParams = { roomId: 'r1', game: 'rps' };
    const rpsPick = jest.fn().mockResolvedValue(null);
    const playing = lobbyRoom({
      status: 'playing',
      players: [
        { userId: 'me', name: 'Me', avatarUrl: null, seat: 0, connected: true },
        { userId: 'u2', name: 'Arjun', avatarUrl: null, seat: 1, connected: true },
      ],
      rps: {
        playerIds: ['me', 'u2'],
        round: 3,
        maxRounds: 7,
        winsNeeded: 4,
        scores: { me: 2, u2: 0 },
        picked: { me: false, u2: true },
        phase: 'picking',
        lastResult: null,
        history: [
          { round: 1, picks: { me: 'paper', u2: 'stone' }, winnerId: 'me' },
          { round: 2, picks: { me: 'paper', u2: 'stone' }, winnerId: 'me' },
        ],
        winnerId: null,
      },
    });
    mockedSocket.mockReturnValue(api({ joinRoom: jest.fn().mockResolvedValue(playing), rpsPick }));
    render(<GameRoomScreen />);
    await screen.findByText('3/7');
    expect(screen.getByText('Make your pick')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pick Scissors'));
    await waitFor(() => expect(rpsPick).toHaveBeenCalledWith('r1', 'scissors'));
  });

  it('finished: shows the winner and a Play again button that calls rematch', async () => {
    mockRouteParams = { roomId: 'r1', game: 'rps' };
    const rematch = jest.fn().mockResolvedValue(null);
    const done = lobbyRoom({
      status: 'finished',
      players: [
        { userId: 'me', name: 'Me', avatarUrl: null, seat: 0, connected: true },
        { userId: 'u2', name: 'Arjun', avatarUrl: null, seat: 1, connected: true },
      ],
      rps: {
        playerIds: ['me', 'u2'],
        round: 5,
        maxRounds: 7,
        winsNeeded: 4,
        scores: { me: 4, u2: 1 },
        picked: { me: true, u2: true },
        phase: 'done',
        lastResult: null,
        history: [],
        winnerId: 'me',
      },
    });
    mockedSocket.mockReturnValue(api({ joinRoom: jest.fn().mockResolvedValue(done), rematch }));
    render(<GameRoomScreen />);
    await screen.findByText('You won!');
    expect(screen.getByText('4 – 1')).toBeTruthy();
    fireEvent.press(screen.getByText('Play again'));
    await waitFor(() => expect(rematch).toHaveBeenCalledWith('r1'));
  });

  it('playing Ludo: renders the board, only lets the current player roll', async () => {
    mockRouteParams = { roomId: 'r1', game: 'ludo' };
    const ludoRoll = jest.fn().mockResolvedValue(null);
    const playing = lobbyRoom({
      game: 'ludo',
      title: 'Ludo',
      status: 'playing',
      maxPlayers: 4,
      players: [
        { userId: 'me', name: 'Me', avatarUrl: null, seat: 0, connected: true },
        { userId: 'u2', name: 'Arjun', avatarUrl: null, seat: 1, connected: true },
      ],
      ludo: {
        turnOrder: ['me', 'u2'],
        colors: { me: 'red', u2: 'yellow' },
        tokens: { me: [-1, -1, 3, 57], u2: [-1, 0, -1, -1] },
        turnIndex: 0,
        phase: 'roll',
        dice: null,
        movable: [],
        sixStreak: 0,
        winnerId: null,
        ranking: [],
        lastEvent: null,
        version: 1,
      },
      deadline: Date.now() + 30_000,
    });
    mockedSocket.mockReturnValue(api({ joinRoom: jest.fn().mockResolvedValue(playing), ludoRoll }));
    render(<GameRoomScreen />);
    await screen.findByText('Your turn — roll the dice');
    expect(screen.getByText('1/4')).toBeTruthy(); // one of my tokens is home
    fireEvent.press(screen.getByLabelText('Roll dice'));
    await waitFor(() => expect(ludoRoll).toHaveBeenCalledWith('r1'));
  });
});
