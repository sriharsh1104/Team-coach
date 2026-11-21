import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as chatApi from '../../api/chat';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { emitToast } from '../../ui/toastBus';
import { SkeletonList } from '../../ui/Skeleton';

type Target = { channelKey: string; title: string; subtitle?: string };

type Props = {
  visible: boolean;
  /** The chat currently open — excluded from the target list. */
  excludeChannelKey: string;
  onClose: () => void;
  onForward: (toChannelKeys: string[]) => Promise<void>;
};

/** Pick one or more chats to forward the selected message into. */
export function ForwardSheet({ visible, excludeChannelKey, onClose, onForward }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(sheetStyles);
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setLoading(true);
    chatApi
      .getChatChannels()
      .then((res) => {
        const byKey = new Map<string, Target>();
        for (const ch of res.channels) {
          if (ch.channelKey === excludeChannelKey) continue;
          byKey.set(ch.channelKey, { channelKey: ch.channelKey, title: ch.title });
        }
        for (const mate of res.teammates) {
          if (mate.channelKey === excludeChannelKey || byKey.has(mate.channelKey)) continue;
          byKey.set(mate.channelKey, { channelKey: mate.channelKey, title: mate.name, subtitle: 'Start a DM' });
        }
        setTargets([...byKey.values()]);
      })
      .catch(() => emitToast('Could not load chats'))
      .finally(() => setLoading(false));
  }, [visible, excludeChannelKey]);

  const toggle = (channelKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(channelKey)) next.delete(channelKey);
      else next.add(channelKey);
      return next;
    });
  };

  const selectedCount = selected.size;
  const canSend = selectedCount > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onForward([...selected]);
      onClose();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not forward'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={staticStyles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>Forward to…</Text>
          {loading ? (
            <SkeletonList count={5} avatarSize={36} style={staticStyles.loader} />
          ) : (
            <FlatList
              data={targets}
              keyExtractor={(t) => t.channelKey}
              style={staticStyles.list}
              ListEmptyComponent={
                <Text style={styles.empty}>No one else to forward to yet.</Text>
              }
              renderItem={({ item }) => {
                const isOn = selected.has(item.channelKey);
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => toggle(item.channelKey)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isOn }}
                  >
                    <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                      {isOn ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                      {item.subtitle ? (
                        <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
          <View style={staticStyles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.sendBtn, !canSend && staticStyles.disabled]}
              disabled={!canSend}
              onPress={() => void send()}
            >
              {sending ? (
                <ActivityIndicator color={colors.chromeInk} size="small" />
              ) : (
                <Text style={styles.sendText}>
                  Forward{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const staticStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  list: { maxHeight: 380, marginTop: 8 },
  loader: { marginVertical: 24 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  disabled: { opacity: 0.5 },
});

function sheetStyles(c: ThemeColors) {
  return {
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: 28,
    },
    title: { color: c.text, fontWeight: '700' as const, fontSize: 16 },
    empty: { color: c.textDim, fontSize: 13, paddingVertical: 20, textAlign: 'center' as const },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    checkboxOn: { backgroundColor: c.chrome, borderColor: c.chrome },
    checkmark: { color: c.chromeInk, fontWeight: '800' as const, fontSize: 13 },
    rowTitle: { color: c.text, fontSize: 15, fontWeight: '600' as const },
    rowSubtitle: { color: c.textDim, fontSize: 12, marginTop: 1 },
    cancelBtn: { flex: 1, alignItems: 'center' as const, paddingVertical: 12, borderRadius: 10, backgroundColor: c.surface },
    cancelText: { color: c.text, fontWeight: '700' as const },
    sendBtn: { flex: 1, alignItems: 'center' as const, paddingVertical: 12, borderRadius: 10, backgroundColor: c.chrome },
    sendText: { color: c.chromeInk, fontWeight: '800' as const },
  };
}
