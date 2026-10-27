import { Platform } from 'react-native';

/**
 * Appends a picked file to a FormData instance, cross-platform.
 *
 * React Native's own FormData implementation accepts an `{uri, name, type}`
 * object in place of a Blob — but on web (Expo web, where `uri` is a
 * `blob:`/`data:` object URL from the browser's file/camera input), the
 * browser's real FormData has no idea what to do with that object and
 * silently sends nothing, so the backend sees no file at all. On web we
 * have to resolve the uri to an actual Blob first.
 */
export async function appendFileToFormData(
  form: FormData,
  file: { uri: string; name: string; type: string },
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await fetch(file.uri).then((res) => res.blob());
    form.append('file', blob, file.name);
    return;
  }
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}
