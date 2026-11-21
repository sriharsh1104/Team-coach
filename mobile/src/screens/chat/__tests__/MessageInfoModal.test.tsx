import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MessageInfoModal } from '../MessageInfoModal';

describe('MessageInfoModal', () => {
  it('lists everyone in "Read by" and only the delivered-but-unread ones in Delivered', () => {
    render(
      <MessageInfoModal
        visible
        readBy={[{ userId: 'u1', name: 'Alice' }]}
        deliveredTo={[
          { userId: 'u1', name: 'Alice' },
          { userId: 'u2', name: 'Bob' },
        ]}
        pending={[{ userId: 'u3', name: 'Carol' }]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getAllByText('Alice')).toHaveLength(1);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Carol')).toBeTruthy();
    expect(screen.getByText('Delivered · not opened')).toBeTruthy();
    expect(screen.getByText('Not delivered')).toBeTruthy();
  });

  it('shows empty states for each section when nobody qualifies', () => {
    render(
      <MessageInfoModal visible readBy={[]} deliveredTo={[]} pending={[]} onClose={jest.fn()} />,
    );

    expect(screen.getAllByText('No one yet.')).toHaveLength(2);
    expect(screen.getByText('Everyone has it.')).toBeTruthy();
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
