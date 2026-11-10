import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ScheduleDateTimeField } from '../../ui/ScheduleDateTimeField';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useTheme } from '../../theme/ThemeContext';
import * as chatApi from '../../api/chat';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { emitToast } from '../../ui/toastBus';

const MAX_LEN = 40;

type Props = {
  visible: boolean;
  channelKey: string;
  onClose: () => void;
};

export function ReminderComposer({ visible, channelKey, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(reminderComposerStyles);
  const [message, setMessage] = useState('');
  const [fireAt, setFireAt] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    const text = message.trim().slice(0, MAX_LEN);
    if (!text) {
      emitToast('Enter a short reminder message');
      return;
    }
    if (fireAt.getTime() < Date.now() - 30_000) {
      emitToast('Pick a future time');
      return;
    }
    setBusy(true);
    try {
      await chatApi.createChatReminder({
        channelKey,
        message: text,
        fireAt: fireAt.toISOString(),
      });
      emitToast('Reminder set');
      setMessage('');
      onClose();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not set reminder'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={staticStyles.backdrop} onPress={onClose}>
        <Pressable style={staticStyles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>Set reminder</Text>
          <Text style={styles.hint}>
            You&apos;ll get a notification with this note (max {MAX_LEN} characters).
          </Text>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={(t) => setMessage(t.slice(0, MAX_LEN))}
            placeholder="e.g. Warm up before scrim"
            placeholderTextColor={colors.textDim}
            maxLength={MAX_LEN}
            autoFocus
          />
          <Text style={styles.counter}>
            {message.trim().length}/{MAX_LEN}
          </Text>
          <ScheduleDateTimeField
            label="Remind me at"
            value={fireAt}
            onChange={setFireAt}
          />
          {busy ? (
            <ActivityIndicator color={colors.chrome} style={{ marginVertical: 12 }} />
          ) : (
            <View style={staticStyles.actions}>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => void onSave()}>
                <Text style={styles.saveText}>Set reminder</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#121216',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 16,
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function reminderComposerStyles(c: ThemeColors) {
  return {
    title: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 17,
      marginBottom: 6,
    },
    hint: {
      color: c.textMuted,
      fontSize: 13,
      marginBottom: 12,
      lineHeight: 18,
    },
    input: {
      borderRadius: 10,
      padding: 12,
      color: c.text,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      fontSize: 15,
    },
    counter: {
      color: c.textDim,
      fontSize: 11,
      textAlign: 'right' as const,
      marginTop: 4,
      marginBottom: 8,
    },
    cancel: { color: c.textMuted, fontWeight: '600' as const, fontSize: 15 },
    saveBtn: {
      backgroundColor: c.chrome,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    saveText: { color: c.chromeInk, fontWeight: '700' as const, fontSize: 14 },
  };
}
