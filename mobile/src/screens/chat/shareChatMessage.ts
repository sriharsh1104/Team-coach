import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

type ShareOpts = {
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | null;
};

async function ensureLocalFile(
  uri: string,
  mediaType: ShareOpts['mediaType'],
): Promise<string> {
  if (uri.startsWith('file://') || uri.startsWith('content://')) return uri;
  const ext =
    mediaType === 'VIDEO' ? 'mp4' : mediaType === 'AUDIO' ? 'm4a' : 'jpg';
  const dest = `${FileSystem.cacheDirectory}share-${Date.now()}.${ext}`;
  const downloaded = await FileSystem.downloadAsync(uri, dest);
  return downloaded.uri;
}

function mimeFor(mediaType: ShareOpts['mediaType']): string {
  if (mediaType === 'VIDEO') return 'video/mp4';
  if (mediaType === 'AUDIO') return 'audio/mp4';
  return 'image/jpeg';
}

/**
 * Opens the OS share sheet (WhatsApp, etc.) for text and/or a media file.
 */
export async function shareChatMessageExternally(opts: ShareOpts): Promise<void> {
  const text = opts.text?.trim() ?? '';
  const mediaUrl = opts.mediaUrl?.trim() || null;

  if (!mediaUrl) {
    if (!text) throw new Error('Nothing to share');
    await Share.share({ message: text });
    return;
  }

  const localUri = await ensureLocalFile(mediaUrl, opts.mediaType);

  if (Platform.OS === 'ios') {
    await Share.share({
      url: localUri,
      message: text || undefined,
    });
    return;
  }

  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(localUri);
    await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
      type: mimeFor(opts.mediaType),
      extra: {
        'android.intent.extra.STREAM': contentUri,
        ...(text ? { 'android.intent.extra.TEXT': text } : {}),
      },
      // FLAG_GRANT_READ_URI_PERMISSION — required for other apps to read the file.
      flags: 1,
    });
    return;
  }

  await Share.share({ message: text || mediaUrl });
}
