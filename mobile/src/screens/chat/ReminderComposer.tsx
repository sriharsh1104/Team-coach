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
import { colors } from '../../theme';
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
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
            <View style={styles.actions}>
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

const styles = StyleSheet.create({
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
  title: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
    marginBottom: 6,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  input: {
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontSize: 15,
  },
  counter: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 16,
  },
  cancel: { color: colors.textMuted, fontWeight: '600', fontSize: 15 },
  saveBtn: {
    backgroundColor: colors.chrome,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveText: { color: colors.chromeInk, fontWeight: '700', fontSize: 14 },
});
