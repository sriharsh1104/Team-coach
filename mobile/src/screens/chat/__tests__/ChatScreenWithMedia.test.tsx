import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ChatScreenWithMedia } from '../ChatScreenWithMedia';

// jest.mock factories can't close over outer `let`/`const` bindings unless
// the name starts with "mock" — a single mutable object sidesteps that.
const mockNav = {
  setOptions: jest.fn(),
  headerRight: undefined as (() => React.ReactElement) | undefined,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: (opts: { headerRight?: () => React.ReactElement }) => {
      mockNav.setOptions(opts);
      mockNav.headerRight = opts.headerRight;
    },
  }),
}));

jest.mock('../ChatScreen', () => ({
  ChatScreen: ({ channelKey }: { channelKey: string }) => {
    const { Text } = require('react-native');
    return <Text>ChatScreen:{channelKey}</Text>;
  },
}));

jest.mock('../ChatMediaModal', () => ({
  ChatMediaModal: ({ visible, title }: { visible: boolean; title: string }) => {
    const { Text } = require('react-native');
    return visible ? <Text>MediaModalOpen:{title}</Text> : null;
  },
}));

jest.mock('../ChatSettingsSheet', () => ({
  ChatSettingsSheet: ({
    visible,
    onOpenMedia,
  }: {
    visible: boolean;
    onOpenMedia?: () => void;
  }) => {
    const { Text, Pressable } = require('react-native');
    if (!visible) return null;
    return (
      <Pressable accessibilityLabel="Media" onPress={() => onOpenMedia?.()}>
        <Text>SettingsOpen</Text>
      </Pressable>
    );
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockNav.headerRight = undefined;
});

describe('ChatScreenWithMedia', () => {
  it('registers a ⋮ header button via navigation.setOptions', () => {
    render(<ChatScreenWithMedia channelKey="guild" title="Guild Chat" />);
    expect(mockNav.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ headerRight: expect.any(Function) }),
    );
  });

  it('opens the media gallery from the ⋮ menu', () => {
    function Harness({ showHeaderRight }: { showHeaderRight: boolean }) {
      const HeaderRight = mockNav.headerRight;
      return (
        <>
          <ChatScreenWithMedia channelKey="guild" title="Guild Chat" />
          {showHeaderRight && HeaderRight ? <HeaderRight /> : null}
        </>
      );
    }

    const { rerender } = render(<Harness showHeaderRight={false} />);
    expect(screen.queryByText('MediaModalOpen:Guild Chat')).toBeNull();

    rerender(<Harness showHeaderRight={true} />);

    act(() => {
      fireEvent.press(screen.getByLabelText('Chat settings'));
    });
    act(() => {
      fireEvent.press(screen.getByLabelText('Media'));
    });

    expect(screen.getByText('MediaModalOpen:Guild Chat')).toBeTruthy();
  });

  it('renders the underlying chat for the given channel', () => {
    render(<ChatScreenWithMedia channelKey="org" title="Team Chat" />);
    expect(screen.getByText('ChatScreen:org')).toBeTruthy();
  });
});
