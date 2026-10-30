type UploadAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
};

const IMAGE_MAX_EDGE = 1600;
const IMAGE_JPEG_QUALITY = 0.72;
const VIDEO_MAX_SIZE = 1280;
const VIDEO_SKIP_UNDER_BYTES = 4_000_000;

function withJpgName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.jpg`;
}

function withMp4Name(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '') || 'video';
  return `${base}.mp4`;
}

export async function tryGetNativeFileSize(uri: string): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFileSize } = require('react-native-compressor') as {
      getFileSize: (u: string) => Promise<number>;
    };
    return await getFileSize(uri);
  } catch {
    return null;
  }
}

export async function compressImageNative(
  asset: UploadAsset,
): Promise<UploadAsset | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Image } = require('react-native-compressor') as {
      Image: {
        compress: (
          uri: string,
          opts?: Record<string, unknown>,
        ) => Promise<string>;
      };
    };
    const uri = await Image.compress(asset.uri, {
      compressionMethod: 'auto',
      maxWidth: IMAGE_MAX_EDGE,
      quality: IMAGE_JPEG_QUALITY,
    });
    return {
      uri,
      fileName: withJpgName(asset.fileName),
      mimeType: 'image/jpeg',
    };
  } catch {
    return null;
  }
}

export async function compressVideoNative(
  asset: UploadAsset,
): Promise<UploadAsset | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Video } = require('react-native-compressor') as {
      Video: {
        compress: (
          uri: string,
          opts?: Record<string, unknown>,
        ) => Promise<string>;
      };
    };
    const uri = await Video.compress(asset.uri, {
      compressionMethod: 'auto',
      maxSize: VIDEO_MAX_SIZE,
      minimumFileSizeForCompress: VIDEO_SKIP_UNDER_BYTES,
    });
    return {
      uri,
      fileName: withMp4Name(asset.fileName),
      mimeType: 'video/mp4',
    };
  } catch {
    return null;
  }
}
