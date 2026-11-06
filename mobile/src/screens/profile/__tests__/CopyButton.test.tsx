import React from 'react';
import { View } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { CopyButton } from '../CopyButton';

describe('CopyButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a tick after copy, then clears it', async () => {
    jest.useFakeTimers();
    render(<CopyButton value="abc" />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy'));
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('abc');
    expect(screen.getByLabelText('Copied')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1200);
    });
    expect(screen.getByLabelText('Copy')).toBeTruthy();
    jest.useRealTimers();
  });

  it('clears the previous tick when another copy button is pressed', async () => {
    render(
      <View>
        <CopyButton value="first" />
        <CopyButton value="second" />
      </View>,
    );

    const buttons = screen.getAllByLabelText('Copy');
    await act(async () => {
      fireEvent.press(buttons[0]);
    });
    expect(screen.getAllByLabelText('Copied')).toHaveLength(1);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy'));
    });
    expect(screen.getAllByLabelText('Copied')).toHaveLength(1);
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('second');
  });
});
