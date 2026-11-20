import { Linking, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { gameInviteLink, gameInviteMessage, parseGameRoomLink, gameRoomDeepLink } from '../gameLinks';
import { shareGameInvite } from '../shareGameInvite';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

const room = { id: 'abc123def456', title: 'Ludo' };

describe('game invite links', () => {
  it('builds an https link that is tappable in chat apps', () => {
    expect(gameInviteLink(room.id)).toMatch(/^https?:\/\/.+\/games\/join\/abc123def456$/);
  });

  it('parses the app scheme and the shared web link back to the room id', () => {
    expect(parseGameRoomLink(gameRoomDeepLink('r1'))).toBe('r1');
    expect(parseGameRoomLink(gameInviteLink('r2'))).toBe('r2');
    expect(parseGameRoomLink('https://example.com/other')).toBeNull();
    expect(parseGameRoomLink(null)).toBeNull();
  });

  it('message contains the game name and the link', () => {
    const msg = gameInviteMessage('Ludo', 'https://x/y');
    expect(msg).toContain('Ludo');
    expect(msg).toContain('https://x/y');
  });
});

describe('shareGameInvite', () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  it('WhatsApp opens with the message + link prefilled', async () => {
    expect(await shareGameInvite('whatsapp', room)).toBe('opened');
    const url = decodeURIComponent(openURL.mock.calls[0][0]);
    expect(url.startsWith('whatsapp://send?text=')).toBe(true);
    expect(url).toContain('/games/join/abc123def456');
  });

  it('falls back to wa.me when WhatsApp is not installed', async () => {
    openURL.mockRejectedValueOnce(new Error('no app'));
    expect(await shareGameInvite('whatsapp', room)).toBe('opened');
    expect(openURL.mock.calls[1][0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it('Telegram opens its share screen with the link', async () => {
    expect(await shareGameInvite('telegram', room)).toBe('opened');
    expect(decodeURIComponent(openURL.mock.calls[0][0])).toContain('/games/join/abc123def456');
  });

  it('Discord copies the message and opens Discord', async () => {
    expect(await shareGameInvite('discord', room)).toBe('copied');
    expect((Clipboard.setStringAsync as jest.Mock).mock.calls[0][0]).toContain('/games/join/');
    expect(openURL.mock.calls[0][0]).toBe('discord://');
  });

  it('Copy only copies', async () => {
    expect(await shareGameInvite('copy', room)).toBe('copied');
    expect(openURL).not.toHaveBeenCalled();
  });

  it('More uses the system share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    expect(await shareGameInvite('more', room)).toBe('opened');
    expect(share.mock.calls[0][0]).toMatchObject({ message: expect.stringContaining('/games/join/') });
  });

  it('reports failure when neither the app nor the web fallback opens', async () => {
    openURL.mockRejectedValue(new Error('nope'));
    expect(await shareGameInvite('telegram', room)).toBe('failed');
  });
});
