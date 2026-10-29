import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert doesn't render a multi-button dialog — the
// call returns immediately with no UI and no button ever fires, so a
// Cancel/Delete-style confirm silently does nothing on web (confirmed: no
// dialog appears, no network request fires, no error). window.confirm is the
// only reliable way to get a yes/no answer there; native platforms keep using
// the real Alert.
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
