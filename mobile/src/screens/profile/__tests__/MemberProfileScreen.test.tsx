import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { MemberProfileScreen } from '../MemberProfileScreen';
import * as usersApi from '../../../api/users';

jest.mock('../../../api/users');
const mockedUsersApi = usersApi as jest.Mocked<typeof usersApi>;

const route = { params: { userId: 'user-2', name: 'Player 2' } } as any;
const navigation = {} as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MemberProfileScreen', () => {
  it('shows "No role set yet" when the member has no roles', async () => {
    mockedUsersApi.getMemberProfile.mockResolvedValue({
      id: 'user-2',
      name: 'Player 2',
      avatarUrl: null,
      roles: [],
      inGameName: null,
      inGameUid: null,
      whatsappUrl: null,
      instagramUrl: null,
      discordUrl: null,
      youtubeUrl: null,
      devices: [],
    });
    render(<MemberProfileScreen route={route} navigation={navigation} />);

    await screen.findByText('No role set yet');
    expect(screen.queryByText('Devices')).toBeNull();
  });

  it('shows roles (read-only), IGN/UID, social links, and devices when all are set', async () => {
    mockedUsersApi.getMemberProfile.mockResolvedValue({
      id: 'user-2',
      name: 'Player 2',
      avatarUrl: null,
      roles: ['SNIPER'],
      inGameName: 'EagleEye',
      inGameUid: 'UID-9',
      whatsappUrl: null,
      instagramUrl: null,
      discordUrl: 'https://discord.gg/team',
      youtubeUrl: null,
      devices: [{ id: 'd1', name: 'Main rig', model: 'ROG Phone 8' }],
    });
    render(<MemberProfileScreen route={route} navigation={navigation} />);

    await screen.findByText('EagleEye');
    expect(screen.getByText('Sniper')).toBeTruthy();
    expect(screen.getByText('UID-9')).toBeTruthy();
    expect(screen.getByText('Discord: https://discord.gg/team')).toBeTruthy();
    expect(screen.getByText('Main rig — ROG Phone 8')).toBeTruthy();
  });

  it('only renders social links that are actually set', async () => {
    mockedUsersApi.getMemberProfile.mockResolvedValue({
      id: 'user-2',
      name: 'Player 2',
      avatarUrl: null,
      roles: [],
      inGameName: null,
      inGameUid: null,
      whatsappUrl: 'https://wa.me/123',
      instagramUrl: null,
      discordUrl: null,
      youtubeUrl: null,
      devices: [],
    });
    render(<MemberProfileScreen route={route} navigation={navigation} />);

    await screen.findByText('WhatsApp: https://wa.me/123');
    expect(screen.queryByText(/Instagram:/)).toBeNull();
    expect(screen.queryByText(/Discord:/)).toBeNull();
  });

  it('opens the link when a social link is pressed', async () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
    mockedUsersApi.getMemberProfile.mockResolvedValue({
      id: 'user-2',
      name: 'Player 2',
      avatarUrl: null,
      roles: [],
      inGameName: null,
      inGameUid: null,
      whatsappUrl: 'https://wa.me/123',
      instagramUrl: null,
      discordUrl: null,
      youtubeUrl: null,
      devices: [],
    });
    render(<MemberProfileScreen route={route} navigation={navigation} />);

    const link = await screen.findByText('WhatsApp: https://wa.me/123');
    await act(async () => {
      fireEvent.press(link);
    });

    expect(openURLSpy).toHaveBeenCalledWith('https://wa.me/123');
  });

  it("SECURITY/LOGIC: shows a clean error (not a crash) when the backend refuses cross-org access", async () => {
    mockedUsersApi.getMemberProfile.mockRejectedValue({
      response: { data: { message: 'You can only view profiles of members in your own org' } },
    });
    render(<MemberProfileScreen route={route} navigation={navigation} />);

    await screen.findByText('You can only view profiles of members in your own org');
  });
});
