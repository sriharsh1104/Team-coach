import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as MediaLibrary from 'expo-media-library';
import { Audio } from 'expo-av';
import { PermissionsSection } from '../../screens/PermissionsSection';
import { useAppPermissions } from '../useAppPermissions';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getMediaLibraryPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImagePicker = require('expo-image-picker') as {
  getCameraPermissionsAsync: jest.Mock;
  requestCameraPermissionsAsync: jest.Mock;
  getMediaLibraryPermissionsAsync: jest.Mock;
  requestMediaLibraryPermissionsAsync: jest.Mock;
};

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockedMedia = MediaLibrary as jest.Mocked<typeof MediaLibrary>;
const mockedAudio = Audio as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
};

function FirstLaunch() {
  useAppPermissions();
  return null;
}

describe('useAppPermissions', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await SecureStore.deleteItemAsync('team-coach.permissionsAsked');
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedMedia.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    mockedMedia.requestPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedAudio.getPermissionsAsync.mockResolvedValue({ granted: true });
    mockedAudio.requestPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it('asks for everything on first launch', async () => {
    render(<FirstLaunch />);

    await waitFor(() =>
      expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled(),
    );
    expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockedAudio.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockedMedia.requestPermissionsAsync).toHaveBeenCalled();
  });

  /**
   * Re-asking every cold start is what put the app through repeated
   * background/foreground cycles, and each cycle re-reads /auth/me — enough
   * of them and the API rate limiter starts answering 429.
   */
  it('does not ask again on a later launch', async () => {
    render(<FirstLaunch />);
    await waitFor(() =>
      expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled(),
    );

    jest.clearAllMocks();
    render(<FirstLaunch />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks Android for the audio bucket by name', async () => {
    render(<FirstLaunch />);

    await waitFor(() =>
      expect(mockedMedia.requestPermissionsAsync).toHaveBeenCalledWith(
        false,
        expect.objectContaining({ granularPermissions: ['audio'] }),
      ),
    );
  });
});

describe('PermissionsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedMedia.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    mockedAudio.getPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.getCameraPermissionsAsync.mockResolvedValue({ granted: false });
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    ImagePicker.getMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
  });

  it('shows which permissions are missing and lets you grant one', async () => {
    render(
      <ThemeProvider>
        <PermissionsSection />
      </ThemeProvider>,
    );

    // Every row starts "unknown" and settles once the checks come back; four
    // of the five are granted here, so four rows end up reading "On".
    await waitFor(() => expect(screen.getAllByText('On')).toHaveLength(4));

    // Camera is the denied one, so it is the only row left with an action.
    const grant = screen.getByLabelText('Turn on Camera');
    expect(screen.queryByLabelText('Turn on Microphone')).toBeNull();

    await act(async () => fireEvent.press(grant));

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    // Granting flips that row over to "On" too, without a reload.
    await waitFor(() => expect(screen.getAllByText('On')).toHaveLength(5));
  });
});
