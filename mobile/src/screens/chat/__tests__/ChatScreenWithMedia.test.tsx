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

beforeEach(() => {
  jest.clearAllMocks();
  mockNav.headerRight = undefined;
});

describe('ChatScreenWithMedia', () => {
  it('registers a Media header button via navigation.setOptions (standalone routes have no custom header of their own)', () => {
    render(<ChatScreenWithMedia channelKey="guild" title="Guild Chat" />);
    expect(mockNav.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ headerRight: expect.any(Function) }),
    );
  });

  it('opens the media gallery, scoped to this channel, when the header button is pressed', () => {
    // In the real app, React Navigation renders headerRight()'s output in
    // the same tree as the screen it belongs to, sharing its state. The root
    // element type must stay the same (a Fragment, both times) across the
    // rerender below, or React remounts ChatScreenWithMedia from scratch
    // instead of preserving the instance whose setMediaOpen the captured
    // headerRight closure actually points to.
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
      fireEvent.press(screen.getByLabelText('Chat Media'));
    });

    expect(screen.getByText('MediaModalOpen:Guild Chat')).toBeTruthy();
  });

  it('renders the underlying chat for the given channel', () => {
    render(<ChatScreenWithMedia channelKey="org" title="Team Chat" />);
    expect(screen.getByText('ChatScreen:org')).toBeTruthy();
  });
});
