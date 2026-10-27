import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ChatScreen } from '../ChatScreen';
import * as chatApi from '../../../api/chat';
import { useAuth } from '../../../auth/AuthContext';
import { TOKEN_STORAGE_KEY } from '../../../api/client';

jest.mock('../../../api/chat');
jest.mock('../../../auth/AuthContext');

const mockedChatApi = chatApi as jest.Mocked<typeof chatApi>;
const mockedUseAuth = useAuth as jest.Mock;

function createFakeSocket() {
  const handlers: Record<string, Array<(...args: any[]) => void>> = {};
  return {
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      (handlers[event] ??= []).push(cb);
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    trigger: (event: string, ...args: any[]) => {
      act(() => {
        (handlers[event] ?? []).forEach((cb) => cb(...args));
      });
    },
  };
}

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    user: { id: 'user-1', email: 'me@example.com', name: 'Me', avatarUrl: null },
  });
  mockedChatApi.getChatHistory.mockResolvedValue([]);
});

describe('ChatScreen', () => {
  it('shows "Connecting…" until the socket connects, then hides it', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);

    render(<ChatScreen />);
    await screen.findByText('Connecting…');

    fakeSocket.trigger('connect');
    await waitFor(() => expect(screen.queryByText('Connecting…')).toBeNull());
  });

  it('connects the socket with the stored token', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    mockedChatApi.connectChatSocket.mockReturnValue(createFakeSocket() as any);

    render(<ChatScreen />);

    await waitFor(() =>
      expect(mockedChatApi.connectChatSocket).toHaveBeenCalledWith('token-123'),
    );
  });

  it('SECURITY/LOGIC: never connects a socket when no auth token is stored', async () => {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);

    render(<ChatScreen />);
    await screen.findByText('Connecting…');

    expect(mockedChatApi.connectChatSocket).not.toHaveBeenCalled();
  });

  it('loads and renders chat history, distinguishing my messages from others', async () => {
    mockedChatApi.getChatHistory.mockResolvedValue([
      {
        id: 'm1',
        senderId: 'user-2',
        senderName: 'Teammate',
        text: 'gg',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'm2',
        senderId: 'user-1',
        senderName: 'Me',
        text: 'nice game',
        createdAt: '2026-01-01T00:01:00.000Z',
      },
    ] as any);
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    mockedChatApi.connectChatSocket.mockReturnValue(createFakeSocket() as any);

    render(<ChatScreen />);

    await screen.findByText('gg');
    expect(screen.getByText('Teammate')).toBeTruthy();
    expect(screen.getByText('nice game')).toBeTruthy();
    // My own message bubble doesn't show a sender label.
    expect(screen.queryByText('Me')).toBeNull();
  });

  it('appends an incoming message:new event to the list', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);

    render(<ChatScreen />);
    await waitFor(() => expect(fakeSocket.on).toHaveBeenCalledWith('message:new', expect.any(Function)));

    fakeSocket.trigger('message:new', {
      id: 'm3',
      senderId: 'user-2',
      senderName: 'Teammate',
      text: 'incoming!',
      createdAt: '2026-01-01T00:02:00.000Z',
    });

    await screen.findByText('incoming!');
  });

  it('blocks sending an empty or whitespace-only draft', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);

    render(<ChatScreen />);
    await waitFor(() => expect(mockedChatApi.connectChatSocket).toHaveBeenCalled());

    await pressAndSettle('Send');
    expect(fakeSocket.emit).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Message your team…'), '   ');
    await pressAndSettle('Send');
    expect(fakeSocket.emit).not.toHaveBeenCalled();
  });

  it('sends a trimmed message and clears the draft', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);

    render(<ChatScreen />);
    await waitFor(() => expect(mockedChatApi.connectChatSocket).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('Message your team…');
    fireEvent.changeText(input, '  gl hf  ');
    await pressAndSettle('Send');

    expect(fakeSocket.emit).toHaveBeenCalledWith('message:send', { text: 'gl hf' });
    expect(input.props.value).toBe('');
  });

  it('disconnects the socket on unmount', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);

    const { unmount } = render(<ChatScreen />);
    await waitFor(() => expect(mockedChatApi.connectChatSocket).toHaveBeenCalled());

    unmount();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });
});
