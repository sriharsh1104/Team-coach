import { Alert, Linking } from 'react-native';
import {
  detectSocialPlatform,
  openSocialUrl,
  socialAppDeepLink,
} from '../openSocialUrl';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
});

describe('socialAppDeepLink', () => {
  it('builds Instagram / Discord / YouTube / WhatsApp / Telegram app URLs', () => {
    expect(
      socialAppDeepLink(
        'instagram',
        'https://www.instagram.com/sacredesportss',
      ),
    ).toBe('instagram://user?username=sacredesportss');
    expect(socialAppDeepLink('discord', 'https://discord.gg/mUES4kcAE')).toBe(
      'discord://invite/mUES4kcAE',
    );
    expect(
      socialAppDeepLink(
        'youtube',
        'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
      ),
    ).toBe(
      'vnd.youtube://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
    );
    expect(socialAppDeepLink('whatsapp', 'https://wa.me/911234567890')).toBe(
      'whatsapp://send?phone=911234567890',
    );
    expect(socialAppDeepLink('telegram', 'https://t.me/sacredesports')).toBe(
      'tg://resolve?domain=sacredesports',
    );
  });
});

describe('openSocialUrl', () => {
  it('opens the native app deep link when available', async () => {
    await openSocialUrl(
      'https://www.instagram.com/sacredesportss',
      'instagram',
    );
    expect(Linking.canOpenURL).toHaveBeenCalledWith(
      'instagram://user?username=sacredesportss',
    );
    expect(Linking.openURL).toHaveBeenCalledWith(
      'instagram://user?username=sacredesportss',
    );
  });

  it('falls back to https (default browser) when the app is not installed', async () => {
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);

    await openSocialUrl('https://discord.gg/mUES4kcAE', 'discord');

    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://discord.gg/mUES4kcAE',
    );
  });

  it('opens mailto for email without trying an app scheme', async () => {
    await openSocialUrl(
      'mailto:sacredesportsss@gmail.com?subject=Hi',
      'email',
    );
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'mailto:sacredesportsss@gmail.com?subject=Hi',
    );
  });
});

describe('detectSocialPlatform', () => {
  it('detects common hosts', () => {
    expect(detectSocialPlatform('https://instagram.com/x')).toBe('instagram');
    expect(detectSocialPlatform('https://discord.gg/x')).toBe('discord');
    expect(detectSocialPlatform('https://youtu.be/x')).toBe('youtube');
    expect(detectSocialPlatform('mailto:a@b.com')).toBe('email');
  });
});
