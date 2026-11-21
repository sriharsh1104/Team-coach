import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { emitToast } from '../../ui/toastBus';

/** Download remote media (or use a local file) and save it into the device gallery. */
export async function saveMediaToGallery(
  uri: string,
  type: 'IMAGE' | 'VIDEO',
): Promise<boolean> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to save media.');
    return false;
  }

  let localUri = uri;
  if (!uri.startsWith('file://') && !uri.startsWith('content://')) {
    const ext = type === 'VIDEO' ? 'mp4' : 'jpg';
    const dest = `${FileSystem.cacheDirectory}media-${Date.now()}.${ext}`;
    const downloaded = await FileSystem.downloadAsync(uri, dest);
    localUri = downloaded.uri;
  }

  await MediaLibrary.saveToLibraryAsync(localUri);
  emitToast(type === 'VIDEO' ? 'Video saved to gallery' : 'Photo saved to gallery');
  return true;
}
