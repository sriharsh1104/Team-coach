import { Alert, Platform } from 'react-native';

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
};

type ConfirmHandler = (req: ConfirmRequest) => void;

let confirmHandler: ConfirmHandler | null = null;

/** Wired by <ConfirmModalHost/> so native confirms use the Sacred theme. */
export function setConfirmHandler(handler: ConfirmHandler | null) {
  confirmHandler = handler;
}

// react-native-web's Alert.alert doesn't render a multi-button dialog — the
// call returns immediately with no UI and no button ever fires, so a
// Cancel/Delete-style confirm silently does nothing on web. window.confirm is
// the only reliable yes/no there; native uses the themed ConfirmModalHost
// when mounted, otherwise falls back to Alert.alert.
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  // Destructive (red) suits Remove/Delete; use false for plain "Yes" actions like Add.
  destructive = true,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  if (confirmHandler) {
    return new Promise((resolve) => {
      confirmHandler!({
        title,
        message,
        confirmLabel,
        cancelLabel,
        destructive,
        resolve,
      });
    });
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
