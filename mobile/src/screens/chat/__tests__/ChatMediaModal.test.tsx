import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ChatMediaModal } from '../ChatMediaModal';
import * as chatApi from '../../../api/chat';

jest.mock('../../../api/chat');

const mockedChatApi = chatApi as jest.Mocked<typeof chatApi>;

const imageMessage = {
  id: 'm1',
  channelKey: 'org',
  senderId: 'user-2',
  senderName: 'Teammate',
  senderRole: 'PLAYER' as const,
  senderIsOwner: false,
  text: null,
  mediaUrl: '/chat/files/shot.jpg',
  mediaType: 'IMAGE' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const videoMessage = {
  ...imageMessage,
  id: 'm2',
  mediaUrl: '/chat/files/clip.mp4',
  mediaType: 'VIDEO' as const,
};

const linkMessage = {
  ...imageMessage,
  id: 'm3',
  mediaUrl: null,
  mediaType: null,
  text: 'check this out https://example.com/clip',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedChatApi.getChatMedia.mockResolvedValue([]);
  mockedChatApi.getChatLinks.mockResolvedValue([]);
  mockedChatApi.resolveChatMediaUrl.mockImplementation(
    (url) => (url ? `http://localhost:3000${url}` : null),
  );
});

describe('ChatMediaModal', () => {
  it('loads this channel\'s media and links when opened', async () => {
    render(
      <ChatMediaModal visible channelKey="org" title="Team Chat" onClose={jest.fn()} />,
    );

    await waitFor(() => {
      expect(mockedChatApi.getChatMedia).toHaveBeenCalledWith('org');
      expect(mockedChatApi.getChatLinks).toHaveBeenCalledWith('org');
    });
  });

  it('does not fetch anything while closed', () => {
    render(
      <ChatMediaModal visible={false} channelKey="org" title="Team Chat" onClose={jest.fn()} />,
    );

    expect(mockedChatApi.getChatMedia).not.toHaveBeenCalled();
  });

  it('shows an empty state when there is no media yet', async () => {
    render(
      <ChatMediaModal visible channelKey="org" title="Team Chat" onClose={jest.fn()} />,
    );

    await screen.findByText('No media shared yet.');
  });

  it('renders a thumbnail per media message, for both images and video', async () => {
    mockedChatApi.getChatMedia.mockResolvedValue([imageMessage, videoMessage] as any);
    render(
      <ChatMediaModal visible channelKey="org" title="Team Chat" onClose={jest.fn()} />,
    );

    await screen.findByText('▶'); // video thumbnail marker
  });

  it('always shows the Docs tab as empty — chat has no document-attachment feature', async () => {
    render(
      <ChatMediaModal visible channelKey="org" title="Team Chat" onClose={jest.fn()} />,
    );
    await waitFor(() => expect(mockedChatApi.getChatMedia).toHaveBeenCalled());

    fireEvent.press(screen.getByText('Docs'));
    expect(screen.getByText('No documents shared yet.')).toBeTruthy();
  });

  it('shows an empty state on the Links tab when there are no links yet', async () => {
    render(
      <ChatMediaModal visible channelKey="org" title="Team Chat" onClose={jest.fn()} />,
    );
    await waitFor(() => expect(mockedChatApi.getChatLinks).toHaveBeenCalled());

    fireEvent.press(screen.getByText('Links'));
    expect(screen.getByText('No links shared yet.')).toBeTruthy();
  });

  it('extracts and opens the link from a message on the Links tab', async () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
    mockedChatApi.getChatLinks.mockResolvedValue([linkMessage] as any);
    render(
      <ChatMediaModal visible channelKey="org" title="Team Chat" onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByText('Links'));
    await screen.findByText('https://example.com/clip');

    await act(async () => {
      fireEvent.press(screen.getByText('https://example.com/clip'));
    });

    expect(openURLSpy).toHaveBeenCalledWith('https://example.com/clip');
  });

  it('calls onClose when Close is pressed', async () => {
    const onClose = jest.fn();
    render(<ChatMediaModal visible channelKey="org" title="Team Chat" onClose={onClose} />);
    await waitFor(() => expect(mockedChatApi.getChatMedia).toHaveBeenCalled());

    fireEvent.press(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
