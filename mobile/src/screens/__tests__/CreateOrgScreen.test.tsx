import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { CreateOrgScreen } from '../CreateOrgScreen';
import { useAuth } from '../../auth/AuthContext';
import * as orgApi from '../../api/org';
import * as chatApi from '../../api/chat';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/org');
jest.mock('../../api/chat');
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedChatApi = chatApi as jest.Mocked<typeof chatApi>;
const mockedImagePicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const navigation = { navigate: jest.fn() } as any;

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.queryByText(text) ?? screen.getByLabelText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('CreateOrgScreen', () => {
  it('navigates back to OrgChoice', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Back');
    expect(navigation.navigate).toHaveBeenCalledWith('OrgChoice');
  });

  it('blocks submission until a name is entered', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Create Org');
    expect(mockedOrgApi.createOrg).not.toHaveBeenCalled();
  });

  it('trims the org name, shows the shareable code, and hands off to setOrg on Continue', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.createOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'ABC123',
      referralLink: 'token123',
      rosterCode: 'XYZ789',
      rosterReferralLink: 'roster-token123',
      myRole: null,
      isOwner: true,
    });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Org / team name'),
      '  Alpha Squad  ',
    );
    await pressAndSettle('Create Org');

    expect(mockedOrgApi.createOrg).toHaveBeenCalledWith('Alpha Squad');
    expect(mockedChatApi.uploadChannelAvatar).not.toHaveBeenCalled();
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(setOrg).not.toHaveBeenCalled();

    await pressAndSettle('Continue');

    expect(setOrg).toHaveBeenCalledWith({
      id: 'org-1',
      name: 'Alpha Squad',
      role: null,
      isOwner: true,
    });
  });

  it('uploads the picked logo as the guild channel photo after create', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    mockedOrgApi.createOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'ABC123',
      referralLink: 'token123',
      rosterCode: 'XYZ789',
      rosterReferralLink: 'roster-token123',
      myRole: null,
      isOwner: true,
    });
    mockedChatApi.uploadChannelAvatar.mockResolvedValue({
      channelKey: 'guild',
      description: null,
      avatarUrl: 'https://cdn.example/logo.jpg',
      disappearAfterSec: null,
    } as any);
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///logo.jpg',
          fileName: 'logo.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    } as any);

    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add org logo'));
    });
    expect(screen.getByLabelText('Change org logo')).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText('Org / team name'),
      'Alpha Squad',
    );
    await pressAndSettle('Create Org');

    expect(mockedOrgApi.createOrg).toHaveBeenCalledWith('Alpha Squad');
    expect(mockedChatApi.uploadChannelAvatar).toHaveBeenCalledWith('guild', {
      uri: 'file:///logo.jpg',
      fileName: 'logo.jpg',
      mimeType: 'image/jpeg',
    });
    expect(screen.getByText('ABC123')).toBeTruthy();
  });

  it('still finishes create when logo upload fails', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    mockedOrgApi.createOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'ABC123',
      referralLink: 'token123',
      rosterCode: 'XYZ789',
      rosterReferralLink: 'roster-token123',
      myRole: null,
      isOwner: true,
    });
    mockedChatApi.uploadChannelAvatar.mockRejectedValue({
      response: { data: { message: 'Upload failed' } },
    });
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///logo.jpg',
          fileName: 'logo.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    } as any);

    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add org logo'));
    });
    fireEvent.changeText(
      screen.getByPlaceholderText('Org / team name'),
      'Alpha Squad',
    );
    await pressAndSettle('Create Org');

    expect(screen.getByText('ABC123')).toBeTruthy();
  });

  it('does not call setOrg when creation fails (API toaster owns the message)', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.createOrg.mockRejectedValue({
      response: { data: { message: 'You already belong to an org' } },
    });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Org / team name'),
      'Alpha Squad',
    );
    await pressAndSettle('Create Org');

    expect(setOrg).not.toHaveBeenCalled();
    expect(mockedChatApi.uploadChannelAvatar).not.toHaveBeenCalled();
  });
});
