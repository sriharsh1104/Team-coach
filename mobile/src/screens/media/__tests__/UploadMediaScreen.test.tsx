import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { UploadMediaScreen } from '../UploadMediaScreen';
import * as mediaApi from '../../../api/media';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../../api/media');

const mockedImagePicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mockedMediaApi = mediaApi as jest.Mocked<typeof mediaApi>;
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

// The screen title and the submit button both read "Upload" (or "Uploading…")
// depending on state, so the submit button is disambiguated by position.
async function pressUpload() {
  await act(async () => {
    fireEvent.press(screen.getAllByText('Upload').slice(-1)[0]);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('UploadMediaScreen', () => {
  it('blocks upload until an asset is picked', async () => {
    render(<UploadMediaScreen navigation={navigation} route={{} as any} />);

    await pressUpload();
    expect(mockedMediaApi.uploadMedia).not.toHaveBeenCalled();
  });

  it('alerts and does not set an asset when gallery permission is denied', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
    } as any);
    render(<UploadMediaScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Choose from Gallery');

    expect(Alert.alert).toHaveBeenCalledWith('Permission needed', 'Allow access to continue.');
    expect(mockedImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is cancelled', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    } as any);
    render(<UploadMediaScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Choose from Gallery');
    await pressUpload();

    expect(mockedMediaApi.uploadMedia).not.toHaveBeenCalled();
  });

  it('picks an image from the gallery and uploads it with a caption', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file://photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', type: 'image' },
      ],
    } as any);
    mockedMediaApi.uploadMedia.mockResolvedValue({} as any);
    render(<UploadMediaScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Choose from Gallery');
    fireEvent.changeText(screen.getByPlaceholderText('Caption (optional)'), 'Clutch play');
    await pressUpload();

    expect(mockedMediaApi.uploadMedia).toHaveBeenCalledWith({
      uri: 'file://photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      type: 'IMAGE',
      caption: 'Clutch play',
    });
    expect(Alert.alert).toHaveBeenCalledWith('Uploaded', 'Your coach has been notified.');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('requests camera permission and uploads a video with no caption as undefined', async () => {
    mockedImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as any);
    mockedImagePicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://clip.mp4', fileName: null, mimeType: null, type: 'video' }],
    } as any);
    mockedMediaApi.uploadMedia.mockResolvedValue({} as any);
    render(<UploadMediaScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Use Camera');
    await pressUpload();

    expect(mockedMediaApi.uploadMedia).toHaveBeenCalledWith({
      uri: 'file://clip.mp4',
      fileName: 'upload.mp4',
      mimeType: 'video/mp4',
      type: 'VIDEO',
      caption: undefined,
    });
  });

  it('shows an error alert and stays on screen when upload fails', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file://photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', type: 'image' },
      ],
    } as any);
    mockedMediaApi.uploadMedia.mockRejectedValue({
      response: { data: { message: 'File too large' } },
    });
    render(<UploadMediaScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Choose from Gallery');
    await pressUpload();

    expect(Alert.alert).toHaveBeenCalledWith('Upload failed', 'File too large');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
