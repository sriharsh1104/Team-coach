import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as MediaLibrary from 'expo-media-library';
import { MusicSharePicker } from '../MusicSharePicker';
import { ThemeProvider } from '../../../theme/ThemeContext';

const mockedLibrary = MediaLibrary as jest.Mocked<typeof MediaLibrary>;

function asset(id: string, filename: string) {
  return {
    id,
    filename,
    uri: `file:///music/${filename}`,
    duration: 180,
  } as unknown as MediaLibrary.Asset;
}

/**
 * Stands in for the voice screen: it re-renders constantly mid-call and
 * passes `onClose` as an inline arrow, so every render handed the picker a
 * brand new callback.
 */
function Host() {
  const [, setTick] = useState(0);
  return (
    <ThemeProvider>
      <Pressable
        accessibilityLabel="rerender host"
        onPress={() => setTick((n) => n + 1)}
      >
        <Text>rerender</Text>
      </Pressable>
      <MusicSharePicker
        visible
        onClose={() => undefined}
        onPick={() => undefined}
      />
    </ThemeProvider>
  );
}

describe('MusicSharePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLibrary.getPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedLibrary.requestPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedLibrary.getAssetsAsync.mockResolvedValue({
      assets: [asset('a1', 'song-one.mp3'), asset('a2', 'song-two.m4a')],
      endCursor: null,
      hasNextPage: false,
    } as never);
  });

  it('lists the device tracks', async () => {
    render(<Host />);
    await waitFor(() => expect(screen.getByText('song-one')).toBeTruthy());
    expect(screen.getByText('song-two')).toBeTruthy();
  });

  /**
   * The regression this file exists for: the picker used to depend on the
   * `onClose` prop's identity, so each parent render re-read the whole music
   * library — the flicker, and the burst of app background/foreground cycles
   * that tripped the API rate limit.
   */
  it('does not re-read the library when the parent re-renders', async () => {
    render(<Host />);
    await waitFor(() => expect(screen.getByText('song-one')).toBeTruthy());
    expect(mockedLibrary.getAssetsAsync).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) {
      await act(async () =>
        fireEvent.press(screen.getByLabelText('rerender host')),
      );
    }

    expect(mockedLibrary.getAssetsAsync).toHaveBeenCalledTimes(1);
  });

  /**
   * requestPermissionsAsync can put the app through a background/foreground
   * cycle, and each cycle re-reads /auth/me and re-registers the push token.
   * Once the permission is held there is no reason to pay that again.
   */
  it('does not re-prompt for permission it already holds', async () => {
    render(<Host />);
    await waitFor(() => expect(screen.getByText('song-one')).toBeTruthy());

    expect(mockedLibrary.getPermissionsAsync).toHaveBeenCalled();
    expect(mockedLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks for permission when it does not have it yet', async () => {
    mockedLibrary.getPermissionsAsync.mockResolvedValue({
      granted: false,
    } as never);
    render(<Host />);

    await waitFor(() =>
      expect(mockedLibrary.requestPermissionsAsync).toHaveBeenCalled(),
    );
  });

  it('builds the list without a per-track native lookup', async () => {
    render(<Host />);
    await waitFor(() => expect(screen.getByText('song-one')).toBeTruthy());

    // Only the picked track needs its real localUri; drawing the list does not.
    expect(mockedLibrary.getAssetInfoAsync).not.toHaveBeenCalled();
  });
});
