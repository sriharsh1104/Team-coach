import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { CopyableField } from '../CopyableField';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CopyableField', () => {
  it('shows the label and value', () => {
    render(<CopyableField label="UID" value="UID-0001" />);
    expect(screen.getByText('UID')).toBeTruthy();
    expect(screen.getByText('UID-0001')).toBeTruthy();
  });

  it('copies the value to the clipboard and flashes a Copied state, then reverts', async () => {
    jest.useFakeTimers();
    render(<CopyableField label="UID" value="UID-0001" />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy'));
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('UID-0001');
    expect(screen.getByLabelText('Copied')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getByLabelText('Copy')).toBeTruthy();

    jest.useRealTimers();
  });
});
