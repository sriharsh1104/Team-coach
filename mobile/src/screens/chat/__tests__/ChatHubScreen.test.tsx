import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ChatHubScreen } from '../ChatHubScreen';
import * as chatApi from '../../../api/chat';

jest.mock('../../../api/chat');
jest.mock('../ChatScreen', () => ({
  ChatScreen: ({ channelKey }: { channelKey: string }) => {
    const { Text } = require('react-native');
    return <Text>Conversation: {channelKey}</Text>;
  },
}));

const mockedChatApi = chatApi as jest.Mocked<typeof chatApi>;

const channelsResponse = {
  channels: [
    {
      channelKey: 'org',
      type: 'ORG' as const,
      title: 'Team Chat',
      peerUserId: null,
      peerAvatarUrl: null,
      unreadCount: 2,
      lastMessageAt: '2026-01-01T00:00:00.000Z',
      lastPreview: 'gg everyone',
    },
  ],
  teammates: [
    { userId: 'user-2', name: 'Teammate', avatarUrl: null, channelKey: 'dm:user-1:user-2' },
  ],
  totalUnread: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedChatApi.getChatChannels.mockResolvedValue(channelsResponse as any);
  mockedChatApi.getChatMedia.mockResolvedValue([]);
  mockedChatApi.getChatLinks.mockResolvedValue([]);
});

describe('ChatHubScreen', () => {
  it('shows the Team Chat row with its unread badge and preview', async () => {
    render(<ChatHubScreen />);

    await screen.findByText('Team Chat');
    expect(screen.getByText(/gg everyone/)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('lists every teammate under Direct Messages', async () => {
    render(<ChatHubScreen />);

    await screen.findByText('Direct Messages');
    await screen.findByText('Teammate');
    expect(screen.queryByText('No teammates yet.')).toBeNull();
  });

  it('keeps Team Chat separate from DM names and shows member count', async () => {
    mockedChatApi.getChatChannels.mockResolvedValue({
      ...channelsResponse,
      channels: [
        {
          ...channelsResponse.channels[0],
          memberCount: 2,
        },
        {
          channelKey: 'dm:user-1:user-2',
          type: 'DM' as const,
          title: 'prashant',
          peerUserId: 'user-2',
          peerAvatarUrl: null,
          memberCount: null,
          unreadCount: 0,
          lastMessageAt: '2026-01-02T00:00:00.000Z',
          lastPreview: 'hey',
        },
      ],
    } as any);
    render(<ChatHubScreen />);

    await screen.findByText('Team Chat');
    expect(screen.getByText(/2 members/)).toBeTruthy();
    expect(screen.getByText('prashant')).toBeTruthy();
    expect(screen.getByText('Direct Messages')).toBeTruthy();
  });

  it('shows "No teammates yet." when there are no other members', async () => {
    mockedChatApi.getChatChannels.mockResolvedValue({
      ...channelsResponse,
      teammates: [],
    } as any);
    render(<ChatHubScreen />);

    await screen.findByText('No teammates yet.');
  });

  it('opens the Team Chat conversation when its row is pressed', async () => {
    render(<ChatHubScreen />);
    await screen.findByText('Team Chat');

    fireEvent.press(screen.getByText('Team Chat'));

    await screen.findByText('Conversation: org');
    expect(screen.getByText('← Chats')).toBeTruthy();
  });

  it('opens a DM conversation when a teammate row is pressed', async () => {
    render(<ChatHubScreen />);
    await screen.findByText('Teammate');

    fireEvent.press(screen.getByText('Teammate'));

    await screen.findByText('Conversation: dm:user-1:user-2');
  });

  it('returns to the inbox when "← Chats" is pressed', async () => {
    render(<ChatHubScreen />);
    await screen.findByText('Team Chat');
    fireEvent.press(screen.getByText('Team Chat'));
    await screen.findByText('← Chats');

    fireEvent.press(screen.getByText('← Chats'));

    await screen.findByText('Team Chat');
    expect(screen.queryByText('Conversation: org')).toBeNull();
  });

  it('BUG FIX: refetches the channel list when returning to the inbox, so a just-sent message is reflected immediately', async () => {
    mockedChatApi.getChatChannels
      .mockResolvedValueOnce(channelsResponse as any)
      .mockResolvedValueOnce({
        ...channelsResponse,
        channels: [
          { ...channelsResponse.channels[0], lastPreview: 'gg just now', unreadCount: 0 },
        ],
      } as any);
    render(<ChatHubScreen />);
    await screen.findByText(/gg everyone/);

    fireEvent.press(screen.getByText('Team Chat'));
    await screen.findByText('← Chats');
    fireEvent.press(screen.getByText('← Chats'));

    expect(mockedChatApi.getChatChannels).toHaveBeenCalledTimes(2);
    await screen.findByText(/gg just now/);
  });

  it('opens the chat media gallery when the labeled "Media" button is pressed', async () => {
    render(<ChatHubScreen />);
    await screen.findByText('Team Chat');
    fireEvent.press(screen.getByText('Team Chat'));
    await screen.findByText('← Chats');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Chat Media'));
    });

    expect(mockedChatApi.getChatMedia).toHaveBeenCalledWith('org');
    expect(mockedChatApi.getChatLinks).toHaveBeenCalledWith('org');
    expect(screen.getByText('No media shared yet.')).toBeTruthy();
  });

  it('also opens the chat media gallery when the conversation title itself is pressed', async () => {
    render(<ChatHubScreen />);
    await screen.findByText('Team Chat');
    fireEvent.press(screen.getByText('Team Chat'));
    await screen.findByText('← Chats');

    // After opening the conversation, "Team Chat" now refers to the
    // conversation header title, not the inbox row — pressing it should open
    // the gallery too, mirroring the WhatsApp-style "tap the header" pattern.
    await act(async () => {
      fireEvent.press(screen.getByText('Team Chat'));
    });

    expect(mockedChatApi.getChatMedia).toHaveBeenCalledWith('org');
  });

  it('calls onLoadError instead of failing silently when the channel list fails to load', async () => {
    const onLoadError = jest.fn();
    mockedChatApi.getChatChannels.mockRejectedValue(new Error('network down'));
    render(<ChatHubScreen onLoadError={onLoadError} />);

    await waitFor(() => expect(onLoadError).toHaveBeenCalledWith(expect.any(Error)));
  });

  it('does not throw when load fails and no onLoadError is provided', async () => {
    mockedChatApi.getChatChannels.mockRejectedValue(new Error('network down'));
    render(<ChatHubScreen />);

    await waitFor(() => expect(mockedChatApi.getChatChannels).toHaveBeenCalled());
  });
});
