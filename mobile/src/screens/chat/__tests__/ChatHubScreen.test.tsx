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
});

describe('ChatHubScreen', () => {
  it('shows the Team Chat row with its unread badge and preview', async () => {
    render(<ChatHubScreen />);

    await screen.findByText('Team Chat');
    expect(screen.getByText('gg everyone')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('lists every teammate under Start Direct Message', async () => {
    render(<ChatHubScreen />);

    await screen.findByText('Teammate');
    expect(screen.queryByText('No teammates yet.')).toBeNull();
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
