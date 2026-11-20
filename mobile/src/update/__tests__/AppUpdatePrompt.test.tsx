import React from 'react';
import { Platform } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AppUpdatePrompt } from '../AppUpdatePrompt';
import * as appUpdate from '../appUpdate';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0' }));
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
  getContentUriAsync: jest.fn(),
}));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));

const info = {
  updateAvailable: true,
  forced: false,
  latestVersion: '1.0.3',
  apkUrl: 'https://example.com/app.apk',
  notes: 'Guild voice added',
};

function renderPrompt() {
  return render(
    <ThemeProvider>
      <AppUpdatePrompt />
    </ThemeProvider>,
  );
}

describe('AppUpdatePrompt', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the new version, notes and lets the user postpone it', async () => {
    jest.spyOn(appUpdate, 'checkForUpdate').mockResolvedValue(info);
    renderPrompt();

    await screen.findByText('Update available');
    expect(screen.getByText(/Version 1\.0\.3 is ready/)).toBeTruthy();
    expect(screen.getByText('Guild voice added')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Later'));
    await waitFor(() => expect(screen.queryByText('Update available')).toBeNull());
  });

  it('Update now downloads the APK from the server link', async () => {
    jest.spyOn(appUpdate, 'checkForUpdate').mockResolvedValue(info);
    const install = jest.spyOn(appUpdate, 'downloadAndInstall').mockResolvedValue('installer-opened');
    renderPrompt();

    fireEvent.press(await screen.findByLabelText('Update now'));
    await waitFor(() => expect(install).toHaveBeenCalledWith(info.apkUrl, expect.any(Function)));
  });

  it('cannot be dismissed when the update is required', async () => {
    jest.spyOn(appUpdate, 'checkForUpdate').mockResolvedValue({ ...info, forced: true });
    renderPrompt();

    await screen.findByText('This update is required to keep using the app.');
    expect(screen.queryByLabelText('Later')).toBeNull();
  });

  it('shows nothing when there is no update', async () => {
    const check = jest.spyOn(appUpdate, 'checkForUpdate').mockResolvedValue(null);
    renderPrompt();

    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(screen.queryByText('Update available')).toBeNull();
  });
});

describe('checkForUpdate', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
    jest.restoreAllMocks();
  });

  it('asks the server with the installed version and returns the offer', async () => {
    Platform.OS = 'android';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => info } as Response);
    expect(await appUpdate.checkForUpdate()).toEqual(info);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/app/update?version=1.0.0');
  });

  it('returns null on network failure, on non-Android, and when no update is offered', async () => {
    Platform.OS = 'android';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await appUpdate.checkForUpdate()).toBeNull();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ...info, updateAvailable: false }),
    });
    expect(await appUpdate.checkForUpdate()).toBeNull();

    Platform.OS = 'ios';
    expect(await appUpdate.checkForUpdate()).toBeNull();
  });
});

describe('downloadAndInstall', () => {
  it('falls back to opening the link when the in-app download fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system');
    FileSystem.createDownloadResumable.mockImplementation(() => {
      throw new Error('no space');
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Linking } = require('react-native');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    expect(await appUpdate.downloadAndInstall('https://example.com/app.apk')).toBe('opened-in-browser');
    expect(open).toHaveBeenCalledWith('https://example.com/app.apk');
  });
});
