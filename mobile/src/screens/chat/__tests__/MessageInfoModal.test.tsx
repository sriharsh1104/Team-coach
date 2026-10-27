import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MessageInfoModal } from '../MessageInfoModal';

describe('MessageInfoModal', () => {
  it('lists everyone in "Read by" and only the delivered-but-unread ones in "Delivered to"', () => {
    render(
      <MessageInfoModal
        visible
        readBy={[{ userId: 'u1', name: 'Alice' }]}
        deliveredTo={[
          { userId: 'u1', name: 'Alice' },
          { userId: 'u2', name: 'Bob' },
        ]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getAllByText('Alice')).toHaveLength(1);
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('shows an empty state for each section when nobody qualifies', () => {
    render(
      <MessageInfoModal visible readBy={[]} deliveredTo={[]} onClose={jest.fn()} />,
    );

    expect(screen.getAllByText('No one yet.')).toHaveLength(2);
  });

  it('calls onClose when the backdrop or Close button is pressed', () => {
    const onClose = jest.fn();
    render(
      <MessageInfoModal
        visible
        readBy={[{ userId: 'u1', name: 'Alice' }]}
        deliveredTo={[]}
        onClose={onClose}
      />,
    );

    fireEvent.press(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
