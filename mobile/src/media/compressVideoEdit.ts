/**
 * Compress a video for the Editing tools screen. Uses react-native-compressor
 * when linked; returns null so the UI can toast instead of silently failing.
 */
export async function compressVideoAtMaxSize(
  uri: string,
  maxSize: number,
  onProgress?: (progress: number) => void,
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Video } = require('react-native-compressor') as {
      Video: {
        compress: (
          path: string,
          opts?: Record<string, unknown>,
          progress?: (p: number) => void,
        ) => Promise<string>;
      };
    };
    return await Video.compress(
      uri,
      {
        compressionMethod: 'manual',
        maxSize,
        minimumFileSizeForCompress: 0,
      },
      onProgress,
    );
  } catch (err) {
    console.warn('compressVideoAtMaxSize failed:', err);
    return null;
  }
}
