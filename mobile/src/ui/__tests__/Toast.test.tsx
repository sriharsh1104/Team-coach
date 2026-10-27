import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Toast, useToast } from '../Toast';

describe('Toast', () => {
  it('renders nothing when there is no message', () => {
    render(<Toast message={null} />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('renders the message when one is set', () => {
    render(<Toast message="Org code copied" />);
    expect(screen.getByText('Org code copied')).toBeTruthy();
  });
});

function Harness() {
  const { message, showToast } = useToast(100);
  return (
    <>
      <Pressable onPress={() => showToast('Saved!')}>
        <Text>Trigger</Text>
      </Pressable>
      <Toast message={message} />
    </>
  );
}

describe('useToast', () => {
  it('shows a message, then auto-dismisses it after the given duration', async () => {
    jest.useFakeTimers();
    render(<Harness />);

    await act(async () => {
      fireEvent.press(screen.getByText('Trigger'));
    });
    expect(screen.getByText('Saved!')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.queryByText('Saved!')).toBeNull();

    jest.useRealTimers();
  });

  it('restarts the dismiss timer when shown again before the first dismiss', async () => {
    jest.useFakeTimers();
    render(<Harness />);

    await act(async () => {
      fireEvent.press(screen.getByText('Trigger'));
    });
    await act(async () => {
      jest.advanceTimersByTime(60);
    });
    // Re-triggered before the first dismiss — should still be visible after
    // the *original* timer would have fired.
    await act(async () => {
      fireEvent.press(screen.getByText('Trigger'));
    });
    await act(async () => {
      jest.advanceTimersByTime(60);
    });
    expect(screen.getByText('Saved!')).toBeTruthy();

    jest.useRealTimers();
  });
});
