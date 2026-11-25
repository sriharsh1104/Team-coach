import React from 'react';
import { FlatList, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import {
  isScreenRecording,
  startScreenRecording,
} from '../../../media/screenRecorder';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react-native';
import { ChatScreen } from '../ChatScreen';
import { RecordingProvider } from '../../../recording/RecordingContext';
import { emitToast } from '../../../ui/toastBus';
import * as chatApi from '../../../api/chat';
import * as voiceApi from '../../../api/voice';
import { useAuth } from '../../../auth/AuthContext';
import { TOKEN_STORAGE_KEY } from '../../../api/client';

jest.mock('../../../api/chat');
jest.mock('../../../api/voice');
jest.mock('../../../auth/AuthContext');
jest.mock('../../../ui/toastBus', () => ({
  emitToast: jest.fn(),
}));
jest.mock('../../../media/screenRecorder', () => ({
  startScreenRecording: jest.fn(),
  stopScreenRecording: jest.fn(),
  isScreenRecording: jest.fn(() => false),
  addScreenRecordingStoppedListener: jest.fn(() => () => {}),
}));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { All: 'All', Videos: 'Videos', Images: 'Images' },
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockedChatApi = chatApi as jest.Mocked<typeof chatApi>;
const mockedVoiceApi = voiceApi as jest.Mocked<typeof voiceApi>;
const mockedUseAuth = useAuth as jest.Mock;
const mockedImagePicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mockedStartRecording = startScreenRecording as jest.Mock;
const mockedIsRecording = isScreenRecording as jest.Mock;

function createFakeSocket() {
  const handlers: Record<string, Array<(...args: any[]) => void>> = {};
  const socket = {
    connected: true,
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      (handlers[event] ??= []).push(cb);
    }),
    once: jest.fn((event: string, cb: (...args: any[]) => void) => {
      (handlers[event] ??= []).push(cb);
    }),
    off: jest.fn((event: string, cb?: (...args: any[]) => void) => {
      if (!handlers[event]) return;
      if (!cb) {
        handlers[event] = [];
        return;
      }
      handlers[event] = handlers[event].filter((h) => h !== cb);
    }),
    connect: jest.fn(),
    emit: jest.fn(),
    // message:send goes through socket.timeout(ms).emit(event, payload, ack).
    // Record it on `emit` (without the ack) so existing assertions keep
    // working, and ack success immediately like the real server does.
    timeout: jest.fn(() => ({
      emit: (event: string, payload: unknown, ack?: (err: unknown, res?: unknown) => void) => {
        socket.emit(event, payload);
        ack?.(null, { ok: true, id: 'srv-1' });
      },
    })),
    disconnect: jest.fn(),
    trigger: (event: string, ...args: any[]) => {
      act(() => {
        (handlers[event] ?? []).forEach((cb) => cb(...args));
      });
    },
  };
  return socket;
}

async function pressAndSettle(label: string) {
  await act(async () => {
    fireEvent.press(
      screen.queryByText(label) ?? screen.getByLabelText(label),
    );
  });
}

async function connectAndSettle() {
  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
  const fakeSocket = createFakeSocket();
  mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);
  render(<RecordingProvider><ChatScreen /></RecordingProvider>);
  await waitFor(() => expect(mockedChatApi.connectChatSocket).toHaveBeenCalled());
  return fakeSocket;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    user: { id: 'user-1', email: 'me@example.com', name: 'Me', avatarUrl: null },
  });
  mockedChatApi.getChatHistory.mockResolvedValue([]);
  mockedChatApi.getChatChannels = jest.fn().mockResolvedValue({
    channels: [],
    teammates: [],
    mentionables: [],
    // One other org member — matches the single "Teammate" receipt used
    // throughout the tick tests below (group tick state now needs ALL other
    // members, not just one, so the roster size has to agree with that).
    rosterMentionables: [
      { userId: 'user-2', name: 'Teammate', avatarUrl: null, inGameName: null, channelKey: 'org' },
    ],
    guildMentionables: [],
    totalUnread: 0,
  });
  mockedChatApi.markChatRead = jest.fn().mockResolvedValue({ unreadCount: 0 });
  mockedChatApi.getReadReceipts = jest.fn().mockResolvedValue([]);
  mockedChatApi.getDeliveryReceipts = jest.fn().mockResolvedValue([]);
  mockedChatApi.searchChatMessages = jest.fn().mockResolvedValue([]);
  mockedChatApi.resolveChatMediaUrl = jest.fn(
    (url) => (url ? `http://localhost:3000${url}` : null),
  ) as any;
  mockedVoiceApi.getVoiceOccupancy.mockResolvedValue({
    room: 'team',
    max: 5,
    count: 0,
    participants: [],
  });
});

describe('ChatScreen', () => {
  it('offers Voice Note from the attach menu instead of a composer mic', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);
    render(
      <RecordingProvider>
        <ChatScreen channelKey="org" />
      </RecordingProvider>,
    );
    await waitFor(() => expect(mockedChatApi.connectChatSocket).toHaveBeenCalled());

    expect(screen.queryByLabelText('Record a voice note')).toBeNull();
    expect(screen.queryByLabelText('Join team voice')).toBeNull();

    fireEvent.press(screen.getByLabelText('Attach'));
    expect(screen.getByLabelText('Voice Note')).toBeTruthy();
  });

  it('shows "Connecting…" until the socket connects, then hides it', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    fakeSocket.connected = false;
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
    // A sent bubble has no coloured plate, so it keeps its name label too —
    // what it must not carry is the role badge (see the next test).
    expect(screen.getByText('Me')).toBeTruthy();
  });

  it("shows the sender's role next to their name for other members' messages, never for my own", async () => {
    mockedChatApi.getChatHistory.mockResolvedValue([
      {
        id: 'm1',
        senderId: 'user-2',
        senderName: 'Owner Coach',
        senderRole: 'COACH',
        senderIsOwner: true,
        text: 'gg',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'm2',
        senderId: 'user-1',
        senderName: 'Me',
        senderRole: 'PLAYER',
        senderIsOwner: false,
        text: 'nice game',
        createdAt: '2026-01-01T00:01:00.000Z',
      },
    ] as any);
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    mockedChatApi.connectChatSocket.mockReturnValue(createFakeSocket() as any);

    render(<ChatScreen />);

    await screen.findByText('Owner Coach · Coach (Owner)');
    // My own message never gets a name/role label, regardless of my role.
    expect(screen.queryByText('Me · Player')).toBeNull();
  });

  it('falls back to the plain name when the sender has since left the org (no current role)', async () => {
    mockedChatApi.getChatHistory.mockResolvedValue([
      {
        id: 'm1',
        senderId: 'user-2',
        senderName: 'Former Member',
        senderRole: null,
        senderIsOwner: false,
        text: 'see ya',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ] as any);
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    mockedChatApi.connectChatSocket.mockReturnValue(createFakeSocket() as any);

    render(<ChatScreen />);

    await screen.findByText('Former Member');
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
    const fakeSocket = await connectAndSettle();

    // Empty draft — Send stays visible but disabled; voice notes live under +.
    expect(screen.queryByLabelText('Record a voice note')).toBeNull();
    expect(screen.getByLabelText('Send').props.accessibilityState).toMatchObject(
      { disabled: true },
    );

    await pressAndSettle('Send');
    expect(fakeSocket.emit).not.toHaveBeenCalledWith(
      'message:send',
      expect.anything(),
    );

    // Whitespace-only draft trims to empty too — same story.
    fireEvent.changeText(screen.getByPlaceholderText('Message'), '   ');
    expect(screen.getByLabelText('Send').props.accessibilityState).toMatchObject(
      { disabled: true },
    );

    await pressAndSettle('Send');
    expect(fakeSocket.emit).not.toHaveBeenCalledWith(
      'message:send',
      expect.anything(),
    );
  });

  it('sends a trimmed message and clears the draft', async () => {
    const fakeSocket = await connectAndSettle();
    fakeSocket.trigger('connect');

    const input = screen.getByPlaceholderText('Message');
    fireEvent.changeText(input, '  gl hf  ');
    await pressAndSettle('Send');

    await waitFor(() =>
      expect(fakeSocket.emit).toHaveBeenCalledWith(
        'message:send',
        expect.objectContaining({
          channelKey: 'org',
          text: 'gl hf',
          clientId: expect.stringMatching(/^pending:/),
        }),
      ),
    );
    expect(input.props.value).toBe('');
    // Optimistic bubble stays visible until message:new reconciles it.
    expect(screen.getByText('gl hf')).toBeTruthy();
  });

  it('leaves the channel but keeps the shared socket open on unmount', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);

    const { unmount } = render(<ChatScreen />);
    await waitFor(() => expect(mockedChatApi.connectChatSocket).toHaveBeenCalled());

    unmount();
    expect(fakeSocket.emit).toHaveBeenCalledWith('channel:leave', expect.anything());
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();
  });

  it('does not re-handshake when a chat opens on an already-connected socket', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
    const fakeSocket = createFakeSocket();
    mockedChatApi.connectChatSocket.mockReturnValue(fakeSocket as any);

    render(<ChatScreen />);

    await waitFor(() =>
      expect(fakeSocket.emit).toHaveBeenCalledWith('channel:join', expect.anything()),
    );
    expect(screen.queryByText('Connecting…')).toBeNull();
  });

  describe('attach menu (consolidated emoji / photo / video / camera)', () => {
    it('shows the attach grid when the "+" icon is pressed, and hides it again on "✕"', async () => {
      await connectAndSettle();

      expect(screen.queryByLabelText('Photo')).toBeNull();
      fireEvent.press(screen.getByLabelText('Attach'));
      expect(screen.getByLabelText('Photo')).toBeTruthy();
      expect(screen.getByLabelText('Video')).toBeTruthy();
      expect(screen.getByLabelText('Camera')).toBeTruthy();
      expect(screen.getByLabelText('Emoji')).toBeTruthy();

      fireEvent.press(screen.getByLabelText('Attach'));
      expect(screen.queryByLabelText('Photo')).toBeNull();
    });

    it('appends an emoji to the draft without closing the panel', async () => {
      await connectAndSettle();
      fireEvent.press(screen.getByLabelText('Attach'));
      fireEvent.press(screen.getByLabelText('Emoji'));

      fireEvent.press(screen.getByText('😀'));

      expect(screen.getByPlaceholderText('Message').props.value).toBe('😀');
      // Still open — picking an emoji doesn't dismiss the panel.
      expect(screen.getByText('😀')).toBeTruthy();
    });

    it('picks a photo restricted to images and sends it as a message', async () => {
      const fakeSocket = await connectAndSettle();
      fakeSocket.trigger('connect');
      mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
        granted: true,
      } as any);
      mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://pic.jpg', fileName: 'pic.jpg', mimeType: 'image/jpeg' }],
      } as any);
      mockedChatApi.uploadChatMedia.mockResolvedValue({
        mediaUrl: '/chat/files/a.jpg',
        mediaType: 'IMAGE',
        fileKey: 'a.jpg',
        mediaPostId: 'post-1',
      });

      fireEvent.press(screen.getByLabelText('Attach'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Photo'));
      });

      expect(mockedImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({ mediaTypes: 'Images' }),
      );
      // A picked photo lands in the cropper first; Send is one tap away.
      await act(async () => {
        fireEvent.press(await screen.findByLabelText('Send photo'));
      });
      // The bubble is optimistic now: it carries a pending clientId so the
      // server echo (message:new) can swap it for the stored row.
      await waitFor(() =>
        expect(fakeSocket.emit).toHaveBeenCalledWith(
          'message:send',
          expect.objectContaining({
            channelKey: 'org',
            mediaUrl: '/chat/files/a.jpg',
            mediaType: 'IMAGE',
            clientId: expect.stringMatching(/^pending:/),
          }),
        ),
      );
      // Panel closes once a pick completes. OCR lives under Stats modes, not chat.
      expect(screen.queryByLabelText('Photo')).toBeNull();
    });

    it('shows the picked image immediately and retries on failed upload tap', async () => {
      await connectAndSettle();
      mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
        granted: true,
      } as any);
      mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://retry.jpg', fileName: 'retry.jpg', mimeType: 'image/jpeg' }],
      } as any);
      mockedChatApi.uploadChatMedia
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce({
          mediaUrl: '/chat/files/retry.jpg',
          mediaType: 'IMAGE',
          fileKey: 'retry.jpg',
          mediaPostId: 'post-retry',
        });

      fireEvent.press(screen.getByLabelText('Attach'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Photo'));
      });
      await act(async () => {
        fireEvent.press(await screen.findByLabelText('Send photo'));
      });

      await waitFor(() =>
        expect(screen.getByLabelText('Upload failed, tap to try again')).toBeTruthy(),
      );
      expect(mockedChatApi.uploadChatMedia).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Upload failed, tap to try again'));
      });

      await waitFor(() =>
        expect(mockedChatApi.uploadChatMedia).toHaveBeenCalledTimes(2),
      );
    });

    it('discarding in the cropper sends nothing', async () => {
      await connectAndSettle();
      mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
        granted: true,
      } as any);
      mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://x.jpg', fileName: 'x.jpg', mimeType: 'image/jpeg' }],
      } as any);

      fireEvent.press(screen.getByLabelText('Attach'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Photo'));
      });
      await act(async () => {
        fireEvent.press(await screen.findByLabelText('Discard photo'));
      });

      expect(mockedChatApi.uploadChatMedia).not.toHaveBeenCalled();
    });

    it('picks a video restricted to videos', async () => {
      await connectAndSettle();
      mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
        granted: true,
      } as any);
      mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: true,
        assets: [],
      } as any);

      fireEvent.press(screen.getByLabelText('Attach'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Video'));
      });

      expect(mockedImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({ mediaTypes: 'Videos' }),
      );
    });

    it('uses the camera (unrestricted media type) for the Camera option', async () => {
      await connectAndSettle();
      mockedImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as any);
      mockedImagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: [] } as any);

      fireEvent.press(screen.getByLabelText('Attach'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Camera'));
      });

      expect(mockedImagePicker.launchCameraAsync).toHaveBeenCalledWith(
        expect.objectContaining({ mediaTypes: 'Images' }),
      );
    });

    it('starts a background game recording and does not upload it', async () => {
      const previous = Platform.OS;
      Platform.OS = 'android';
      await connectAndSettle();
      mockedIsRecording.mockReturnValue(false);
      mockedStartRecording.mockResolvedValue('started');

      fireEvent.press(screen.getByLabelText('Attach'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Record'));
      });

      expect(mockedStartRecording).toHaveBeenCalled();
      expect(mockedImagePicker.launchCameraAsync).not.toHaveBeenCalled();
      expect(mockedChatApi.uploadChatMedia).not.toHaveBeenCalled();
      expect(emitToast).toHaveBeenCalledWith(
        expect.stringContaining('Open your game'),
      );
      Platform.OS = previous;
    });
  });

  describe('inline media viewer', () => {
    it('opens the full-screen viewer when an image bubble is tapped', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue([
        {
          id: 'm1',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: null,
          mediaType: 'IMAGE',
          mediaUrl: '/chat/files/pic.jpg',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ] as any);
      await connectAndSettle();
      expect(screen.queryByLabelText('Close viewer')).toBeNull();

      fireEvent.press(screen.getByLabelText('View image'));

      expect(await screen.findByLabelText('Close viewer')).toBeTruthy();
    });

    it('opens the full-screen viewer when a video thumbnail is tapped', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue([
        {
          id: 'm1',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: null,
          mediaType: 'VIDEO',
          mediaUrl: '/chat/files/clip.mp4',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ] as any);
      await connectAndSettle();

      fireEvent.press(screen.getByText('▶'));

      expect(await screen.findByLabelText('Close viewer')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Close viewer'));
      await waitFor(() => expect(screen.queryByLabelText('Close viewer')).toBeNull());
    });
  });

  describe('WhatsApp-style ticks (sent / delivered / seen)', () => {
    const lastMineMessage = [
      {
        id: 'm1',
        senderId: 'user-1',
        senderName: 'Me',
        text: 'gl hf',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    it('shows a single tick ("Sent") under my last message when nobody has it yet', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      mockedChatApi.getReadReceipts.mockResolvedValue([]);
      mockedChatApi.getDeliveryReceipts.mockResolvedValue([]);

      await connectAndSettle();

      expect(await screen.findByLabelText('Sent')).toBeTruthy();
    });

    it('shows a double grey tick ("Delivered to N") once delivered but not yet read', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      mockedChatApi.getReadReceipts.mockResolvedValue([]);
      mockedChatApi.getDeliveryReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Teammate', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
      ]);

      await connectAndSettle();

      expect(await screen.findByLabelText('Delivered to 1')).toBeTruthy();
    });

    it('shows a double blue tick ("Seen by N") once read, taking priority over delivered', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      mockedChatApi.getReadReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Teammate', lastReadAt: '2026-01-01T00:05:00.000Z' },
      ]);
      mockedChatApi.getDeliveryReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Teammate', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
      ]);

      await connectAndSettle();

      expect(await screen.findByLabelText('Seen by 1')).toBeTruthy();
    });

    it('a group chat stays on "Sent"/"Delivered to N" until EVERY other member has read it, not just one', async () => {
      mockedChatApi.getChatChannels.mockResolvedValueOnce({
        channels: [],
        teammates: [],
        mentionables: [],
        rosterMentionables: [
          { userId: 'user-2', name: 'Alice', avatarUrl: null, inGameName: null, channelKey: 'org' },
          { userId: 'user-3', name: 'Bob', avatarUrl: null, inGameName: null, channelKey: 'org' },
        ],
        guildMentionables: [],
        totalUnread: 0,
      });
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      // Both delivered, but only one of the two has read it — a single
      // reader must not flip the whole group tick blue.
      mockedChatApi.getDeliveryReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
        { userId: 'user-3', name: 'Bob', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
      ]);
      mockedChatApi.getReadReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastReadAt: '2026-01-01T00:05:00.000Z' },
      ]);

      await connectAndSettle();

      expect(await screen.findByLabelText('Delivered to 2')).toBeTruthy();
      expect(screen.queryByLabelText('Seen by 1')).toBeNull();
      expect(screen.queryByLabelText('Seen by 2')).toBeNull();
    });

    it('a group chat turns the tick "Seen by N" only once the LAST member has read it', async () => {
      mockedChatApi.getChatChannels.mockResolvedValueOnce({
        channels: [],
        teammates: [],
        mentionables: [],
        rosterMentionables: [
          { userId: 'user-2', name: 'Alice', avatarUrl: null, inGameName: null, channelKey: 'org' },
          { userId: 'user-3', name: 'Bob', avatarUrl: null, inGameName: null, channelKey: 'org' },
        ],
        guildMentionables: [],
        totalUnread: 0,
      });
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      mockedChatApi.getDeliveryReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
        { userId: 'user-3', name: 'Bob', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
      ]);
      mockedChatApi.getReadReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastReadAt: '2026-01-01T00:05:00.000Z' },
        { userId: 'user-3', name: 'Bob', lastReadAt: '2026-01-01T00:06:00.000Z' },
      ]);

      await connectAndSettle();

      expect(await screen.findByLabelText('Seen by 2')).toBeTruthy();
    });

    it('lists a group member who has neither delivered nor read as "Pending" in Message Info', async () => {
      mockedChatApi.getChatChannels.mockResolvedValueOnce({
        channels: [],
        teammates: [],
        mentionables: [],
        rosterMentionables: [
          { userId: 'user-2', name: 'Alice', avatarUrl: null, inGameName: null, channelKey: 'org' },
          { userId: 'user-3', name: 'Bob', avatarUrl: null, inGameName: null, channelKey: 'org' },
        ],
        guildMentionables: [],
        totalUnread: 0,
      });
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      // Only Alice has gotten it at all — Bob hasn't delivered or read it.
      mockedChatApi.getDeliveryReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
      ]);
      mockedChatApi.getReadReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastReadAt: '2026-01-01T00:05:00.000Z' },
      ]);

      await connectAndSettle();
      // Partial group delivery — tick stays "Sent", not "Delivered to 1".
      const tick = await screen.findByLabelText('Sent');

      await act(async () => {
        fireEvent(tick, 'longPress');
      });

      expect(await screen.findByText('Message Info')).toBeTruthy();
      expect(screen.getByText('Alice')).toBeTruthy();
      expect(screen.getByText('Not delivered')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('shows the singular "Delivered"/"Seen" labels (not "...to/by 1") in a 1:1 DM', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue([
        { ...lastMineMessage[0], text: 'hey' },
      ]);
      mockedChatApi.getReadReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Teammate', lastReadAt: '2026-01-01T00:05:00.000Z' },
      ]);
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
      mockedChatApi.connectChatSocket.mockReturnValue(createFakeSocket() as any);

      render(<ChatScreen channelKey="dm:user-1:user-2" />);

      await screen.findByLabelText('Seen');
      expect(screen.queryByLabelText('Seen by 1')).toBeNull();
    });

    it('emits channel:delivered and channel:read on connect, and channel:delivered for every incoming message regardless of its channel', async () => {
      const fakeSocket = await connectAndSettle();
      fakeSocket.trigger('connect');

      expect(fakeSocket.emit).toHaveBeenCalledWith('channel:delivered', { channelKey: 'org' });
      expect(fakeSocket.emit).toHaveBeenCalledWith('channel:read', { channelKey: 'org' });

      fakeSocket.trigger('message:new', {
        id: 'm2',
        channelKey: 'org',
        senderId: 'user-2',
        senderName: 'Teammate',
        text: 'hi',
        createdAt: '2026-01-01T00:02:00.000Z',
      });

      await waitFor(() =>
        expect(fakeSocket.emit).toHaveBeenCalledWith('channel:read', { channelKey: 'org' }),
      );

      // A message for a channel other than the one being viewed still marks
      // delivered (the socket is always joined to the org room), just not read.
      fakeSocket.trigger('message:new', {
        id: 'm3',
        channelKey: 'dm:someone:else',
        senderId: 'user-2',
        senderName: 'Teammate',
        text: 'psst',
        createdAt: '2026-01-01T00:03:00.000Z',
      });
      expect(fakeSocket.emit).toHaveBeenCalledWith('channel:delivered', {
        channelKey: 'dm:someone:else',
      });
      expect(fakeSocket.emit).not.toHaveBeenCalledWith('channel:read', {
        channelKey: 'dm:someone:else',
      });
    });

    it('updates the tick live when a chat:delivered then a chat:read event arrive over the socket', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      const fakeSocket = await connectAndSettle();
      await screen.findByLabelText('Sent');

      fakeSocket.trigger('chat:delivered', {
        userId: 'user-2',
        userName: 'Teammate',
        channelKey: 'org',
        lastDeliveredAt: '2026-01-01T00:02:00.000Z',
      });
      await screen.findByLabelText('Delivered to 1');

      fakeSocket.trigger('chat:read', {
        userId: 'user-2',
        userName: 'Teammate',
        channelKey: 'org',
        lastReadAt: '2026-01-01T00:05:00.000Z',
      });
      await screen.findByLabelText('Seen by 1');
    });

    it('ignores chat:delivered/chat:read events for a different channel', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      const fakeSocket = await connectAndSettle();
      await screen.findByLabelText('Sent');

      fakeSocket.trigger('chat:delivered', {
        userId: 'user-2',
        userName: 'Teammate',
        channelKey: 'dm:someone:else',
        lastDeliveredAt: '2026-01-01T00:02:00.000Z',
      });
      fakeSocket.trigger('chat:read', {
        userId: 'user-2',
        userName: 'Teammate',
        channelKey: 'dm:someone:else',
        lastReadAt: '2026-01-01T00:05:00.000Z',
      });

      expect(screen.getByLabelText('Sent')).toBeTruthy();
    });

    it('BUG FIX: ignores a chat:delivered/chat:read echo for my own user id (marking my own message read should not count as a view)', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      const fakeSocket = await connectAndSettle();
      await screen.findByLabelText('Sent');

      fakeSocket.trigger('chat:delivered', {
        userId: 'user-1',
        userName: 'Me',
        channelKey: 'org',
        lastDeliveredAt: '2026-01-01T00:02:00.000Z',
      });
      fakeSocket.trigger('chat:read', {
        userId: 'user-1',
        userName: 'Me',
        channelKey: 'org',
        lastReadAt: '2026-01-01T00:05:00.000Z',
      });

      expect(screen.getByLabelText('Sent')).toBeTruthy();
    });

    it('opens the Message Info sheet on long-press, listing read-by and delivered-to separately; a short tap does nothing', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue(lastMineMessage);
      mockedChatApi.getReadReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastReadAt: '2026-01-01T00:05:00.000Z' },
      ]);
      mockedChatApi.getDeliveryReceipts.mockResolvedValue([
        { userId: 'user-2', name: 'Alice', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
        { userId: 'user-3', name: 'Bob', lastDeliveredAt: '2026-01-01T00:02:00.000Z' },
      ]);

      await connectAndSettle();
      const tick = await screen.findByLabelText('Seen by 1');

      await act(async () => {
        fireEvent.press(tick);
      });
      expect(screen.queryByText('Message Info')).toBeNull();

      await act(async () => {
        fireEvent(tick, 'longPress');
      });

      expect(await screen.findByText('Message Info')).toBeTruthy();
      expect(screen.getByText('Alice')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
    });
  });

  describe('pinned message banner', () => {
    it('shows a banner with the pinned message preview once a message is pinned', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue([
        {
          id: 'm1',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: 'hello',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'm2',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: 'pin me',
          createdAt: '2026-01-01T00:01:00.000Z',
          pinned: true,
        },
      ] as any);

      await connectAndSettle();

      const banner = await screen.findByLabelText('Pinned message, tap to jump to it');
      expect(within(banner).getByText('Pinned message')).toBeTruthy();
      expect(within(banner).getByText('pin me')).toBeTruthy();
    });

    it('shows a count + cycle control when more than one message is pinned', async () => {
      mockedChatApi.getChatHistory.mockResolvedValue([
        {
          id: 'm1',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: 'first pin',
          createdAt: '2026-01-01T00:00:00.000Z',
          pinned: true,
        },
        {
          id: 'm2',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: 'second pin',
          createdAt: '2026-01-01T00:01:00.000Z',
          pinned: true,
        },
      ] as any);

      await connectAndSettle();

      let banner = await screen.findByLabelText('Pinned message, tap to jump to it');
      expect(within(banner).getByText('Pinned message 1/2')).toBeTruthy();
      expect(within(banner).getByText('first pin')).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Show next pinned message'));
      });

      banner = await screen.findByLabelText('Pinned message, tap to jump to it');
      expect(within(banner).getByText('Pinned message 2/2')).toBeTruthy();
      expect(within(banner).getByText('second pin')).toBeTruthy();
    });
  });

  describe('pagination (older history)', () => {
    function makeMessages(count: number, startIndex = 0) {
      return Array.from({ length: count }, (_, i) => ({
        id: `m${startIndex + i}`,
        channelKey: 'org',
        senderId: 'user-2',
        senderName: 'Teammate',
        senderRole: 'PLAYER' as const,
        senderIsOwner: false,
        text: `msg-${startIndex + i}`,
        mediaUrl: null,
        mediaType: null,
        createdAt: new Date(2026, 0, 1, 0, startIndex + i).toISOString(),
      }));
    }

    it('loads older messages via onEndReached and prepends them', async () => {
      const firstPage = makeMessages(50, 50); // a full page => more may exist
      mockedChatApi.getChatHistory.mockResolvedValueOnce(firstPage);
      await connectAndSettle();
      // inverted + newest-first: latest rows mount first
      await screen.findByText('msg-99');

      const olderPage = makeMessages(3, 0);
      mockedChatApi.getChatHistory.mockResolvedValueOnce(olderPage);

      const list = screen.UNSAFE_getByType(FlatList);
      await act(async () => {
        list.props.onEndReached();
      });

      expect(mockedChatApi.getChatHistory).toHaveBeenLastCalledWith('org', 'm50');
      // Newest stays mounted; older rows may be virtualized off-screen.
      expect(screen.getByText('msg-99')).toBeTruthy();
      const data = list.props.data as Array<{ text: string }>;
      expect(data.some((m) => m.text === 'msg-0')).toBe(true);
      expect(data).toHaveLength(53);
    });

    it('does not request another page once a short page signals there is no more history', async () => {
      const shortPage = makeMessages(3, 0); // fewer than a full page => nothing older
      mockedChatApi.getChatHistory.mockResolvedValueOnce(shortPage);
      await connectAndSettle();
      await screen.findByText('msg-2');

      const list = screen.UNSAFE_getByType(FlatList);
      await act(async () => {
        list.props.onEndReached();
      });

      expect(mockedChatApi.getChatHistory).toHaveBeenCalledTimes(1);
    });
  });

  describe('in-chat search', () => {
    it('debounces, searches this channel, and keeps the conversation on screen', async () => {
      jest.useFakeTimers();
      mockedChatApi.getChatHistory.mockResolvedValue([
        {
          id: 'm1',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: 'hello from teammate',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'm2',
          senderId: 'user-1',
          senderName: 'Me',
          text: 'other stuff',
          createdAt: '2026-01-01T00:01:00.000Z',
        },
      ] as any);
      mockedChatApi.searchChatMessages.mockResolvedValue([
        {
          id: 'm1',
          senderId: 'user-2',
          senderName: 'Teammate',
          text: 'hello from teammate',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ] as any);

      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'token-123');
      mockedChatApi.connectChatSocket.mockReturnValue(createFakeSocket() as any);
      const onCloseSearch = jest.fn();
      render(
        <ChatScreen searchActive onCloseSearch={onCloseSearch} />,
      );
      await screen.findByText('hello from teammate');
      expect(screen.getByLabelText('Search in chat')).toBeTruthy();

      fireEvent.changeText(screen.getByLabelText('Search in chat'), 'hello');
      expect(mockedChatApi.searchChatMessages).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() =>
        expect(mockedChatApi.searchChatMessages).toHaveBeenCalledWith(
          'org',
          'hello',
        ),
      );
      expect(screen.getByLabelText('Search match count').props.children).toEqual(
        '1/1',
      );
      // Still in the same chat list — not a separate results screen.
      expect(screen.getByText('other stuff')).toBeTruthy();

      fireEvent.press(screen.getByLabelText('Close search'));
      expect(onCloseSearch).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
