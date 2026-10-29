import { compressForUpload } from '../compressForUpload';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  Image as CompressorImage,
  Video as CompressorVideo,
  getFileSize,
} from 'react-native-compressor';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: jest.fn(async () => ({
    uri: 'file://compressed.jpg',
    width: 1200,
    height: 800,
  })),
}));

const mockedManipulator = ImageManipulator as jest.Mocked<typeof ImageManipulator>;
const mockedCompressorImage = CompressorImage as jest.Mocked<typeof CompressorImage>;
const mockedCompressorVideo = CompressorVideo as jest.Mocked<typeof CompressorVideo>;
const mockedGetFileSize = getFileSize as jest.MockedFunction<typeof getFileSize>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetFileSize.mockResolvedValue(8_000_000);
});

describe('compressForUpload', () => {
  it('falls back to ImageManipulator JPEG when native image compress is unavailable', async () => {
    mockedCompressorImage.compress.mockRejectedValueOnce(new Error('no native'));

    const result = await compressForUpload({
      uri: 'file://big.png',
      fileName: 'big.png',
      mimeType: 'image/png',
      width: 4000,
      height: 3000,
    });

    expect(mockedManipulator.manipulateAsync).toHaveBeenCalled();
    expect(result).toEqual({
      uri: 'file://compressed.jpg',
      fileName: 'big.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('uses native WhatsApp-style video compress when available', async () => {
    mockedCompressorVideo.compress.mockResolvedValueOnce('file://clip-small.mp4');

    const result = await compressForUpload({
      uri: 'file://clip.mov',
      fileName: 'clip.mov',
      mimeType: 'video/quicktime',
    });

    expect(mockedCompressorVideo.compress).toHaveBeenCalled();
    expect(result).toEqual({
      uri: 'file://clip-small.mp4',
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
    });
  });
});
