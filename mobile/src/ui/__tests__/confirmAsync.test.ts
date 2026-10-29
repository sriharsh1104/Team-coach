import { Alert, Platform } from 'react-native';
import { confirmAsync } from '../confirmAsync';

const originalOS = Platform.OS;

// jest-expo's test environment has no DOM, so `window.confirm` (used by the
// web branch of confirmAsync, which only ever runs in an actual browser)
// doesn't exist here — assign a stand-in jest.fn() to exercise it.
(global as any).window = { confirm: jest.fn() };

afterEach(() => {
  (Platform as any).OS = originalOS;
  jest.restoreAllMocks();
});

describe('confirmAsync', () => {
  it('uses window.confirm on web, since react-native-web\'s Alert.alert is a no-op', async () => {
    (Platform as any).OS = 'web';
    (window.confirm as jest.Mock).mockReturnValue(true);

    const result = await confirmAsync('Delete entry', 'Remove "test"?', 'Delete');

    expect(window.confirm).toHaveBeenCalledWith('Delete entry\n\nRemove "test"?');
    expect(result).toBe(true);
  });

  it('resolves false when window.confirm is dismissed on web', async () => {
    (Platform as any).OS = 'web';
    (window.confirm as jest.Mock).mockReturnValue(false);

    expect(await confirmAsync('Title', 'Message')).toBe(false);
  });

  it('uses the real Alert.alert on native, resolving true when the confirm button is pressed', async () => {
    (Platform as any).OS = 'ios';
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'Delete')?.onPress?.(undefined as any);
    });

    expect(await confirmAsync('Delete entry', 'Remove "test"?', 'Delete')).toBe(true);
  });

  it('resolves false when Cancel is pressed on native', async () => {
    (Platform as any).OS = 'android';
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'Cancel')?.onPress?.(undefined as any);
    });

    expect(await confirmAsync('Title', 'Message')).toBe(false);
  });
});
