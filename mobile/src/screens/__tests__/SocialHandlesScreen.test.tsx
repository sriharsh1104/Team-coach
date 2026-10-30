import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { SocialHandlesScreen } from '../SocialHandlesScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
});

describe('SocialHandlesScreen', () => {
  it('lists social channels with copy; email opens mailto', async () => {
    render(<SocialHandlesScreen navigation={navigation} route={{} as any} />);

    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getAllByText('Instagram').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Discord').length).toBeGreaterThan(0);
    expect(screen.getByText('YouTube')).toBeTruthy();
    expect(screen.getByText('Telegram')).toBeTruthy();
    expect(
      screen.getAllByText(
        'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('sacredesportsss@gmail.com').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText('https://www.instagram.com/sacredesportss').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('https://discord.gg/mUES4kcAE').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Add your link here').length).toBeGreaterThan(0);
    expect(screen.getByText('@SACREDESPORTSS')).toBeTruthy();
    expect(screen.getByText('SACRED ESPORTS')).toBeTruthy();
    expect(screen.getByText('instagram.com/sacredesportss')).toBeTruthy();
    expect(screen.getByText('discord.gg/mUES4kcAE')).toBeTruthy();
    expect(
      screen.getByLabelText('Sacred Esports Instagram QR code'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Sacred Esports Discord invite QR code'),
    ).toBeTruthy();
    expect(screen.getByText('Scan to connect')).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('Email: sacredesportsss@gmail.com'),
      );
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining('mailto:sacredesportsss@gmail.com'),
    );

    await act(async () => {
      fireEvent.press(screen.getAllByLabelText('Copy')[0]);
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'sacredesportsss@gmail.com',
    );
  });
});
