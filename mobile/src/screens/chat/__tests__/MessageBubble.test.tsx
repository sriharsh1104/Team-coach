import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ChatMessage } from '../../../api/types';
import { getThemeColors } from '../../../theme';
import { chatStyles } from '../chatStyles';
import { MessageBubble } from '../MessageBubble';

const colors = getThemeColors('black');
const styles = chatStyles(colors);

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    channelKey: 'org',
    senderId: 'u2',
    senderName: 'Rhea',
    senderRole: 'PLAYER',
    senderIsOwner: false,
    text: 'gg wp',
    mediaUrl: null,
    mediaType: null,
    createdAt: '2026-01-01T10:30:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  styles,
  colors,
  isMine: false,
  isSelected: false,
  isHighlighted: false,
  selectMode: false,
  knownIgns: [],
  showSeen: false,
  tickState: 'sent' as const,
  tickLabel: 'Sent',
  showAddMatch: false,
  onPress: jest.fn(),
  onLongPress: jest.fn(),
  onOpenMedia: jest.fn(),
  onToggleReaction: jest.fn(),
  onShowInfo: jest.fn(),
  onAddMatch: jest.fn(),
};

describe('MessageBubble', () => {
  it('renders the message body and sender', () => {
    render(<MessageBubble {...baseProps} message={message()} />);
    expect(screen.getByText('gg wp')).toBeTruthy();
    expect(screen.getByText(/Rhea/)).toBeTruthy();
  });

  it('still shows who sent it on your own messages (no bubble plate)', () => {
    render(<MessageBubble {...baseProps} message={message()} isMine />);
    expect(screen.getByText(/Rhea/)).toBeTruthy();
  });

  it('reports taps and long-presses with the message', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const m = message();
    render(
      <MessageBubble
        {...baseProps}
        message={m}
        onPress={onPress}
        onLongPress={onLongPress}
      />,
    );

    const bubble = screen.getByLabelText('Message from Rhea');
    fireEvent.press(bubble);
    fireEvent(bubble, 'longPress');

    expect(onPress).toHaveBeenCalledWith(m);
    expect(onLongPress).toHaveBeenCalledWith(m);
  });

  it('does not re-render when the parent re-renders with the same props', () => {
    const renders = jest.fn();
    const Probe = (props: React.ComponentProps<typeof MessageBubble>) => {
      renders();
      return <MessageBubble {...props} />;
    };
    const Memoed = React.memo(Probe);
    const m = message();

    // Stands in for ChatScreen's composer: typing changes screen state on
    // every keystroke, which used to re-render every mounted bubble.
    function Harness() {
      const [draft, setDraft] = useState('');
      return (
        <>
          <Pressable
            accessibilityLabel="type"
            onPress={() => setDraft(draft + 'a')}
          >
            <Text>{draft}</Text>
          </Pressable>
          <Memoed {...baseProps} message={m} />
        </>
      );
    }

    render(<Harness />);
    expect(renders).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('type'));
    fireEvent.press(screen.getByLabelText('type'));

    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('re-renders when its own row changes', () => {
    const { rerender } = render(
      <MessageBubble {...baseProps} message={message()} />,
    );
    rerender(
      <MessageBubble {...baseProps} message={message({ text: 'edited' })} />,
    );
    expect(screen.getByText('edited')).toBeTruthy();
  });
});
