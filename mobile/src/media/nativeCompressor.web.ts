type UploadAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
};

/** Web — never pull react-native-compressor into the Metro graph. */
export async function tryGetNativeFileSize(_uri: string): Promise<number | null> {
  return null;
}

export async function compressImageNative(
  _asset: UploadAsset,
): Promise<UploadAsset | null> {
  return null;
}

export async function compressVideoNative(
  _asset: UploadAsset,
): Promise<UploadAsset | null> {
  return null;
}
