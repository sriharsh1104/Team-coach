import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as chatApi from '../../api/chat';
import { ChatChannelMeta } from '../../api/types';
import { resolveMediaUrl } from '../../api/client';
import { colors } from '../../theme';
import { emitToast } from '../../ui/toastBus';
import { apiErrorMessage } from '../../api/apiErrorMessage';

const DISAPPEAR_OPTIONS: Array<{ label: string; sec: number | null }> = [
  { label: 'Off', sec: null },
  { label: '1 hour', sec: 3600 },
  { label: '24 hours', sec: 86400 },
  { label: '7 days', sec: 604800 },
];

type Props = {
  visible: boolean;
  channelKey: string;
  isGroup: boolean;
  onClose: () => void;
  onCleared: () => void;
  onStarredFilter: () => void;
  onMetaChanged?: (meta: ChatChannelMeta) => void;
};

export function ChatSettingsSheet({
  visible,
  channelKey,
  isGroup,
  onClose,
  onCleared,
  onStarredFilter,
  onMetaChanged,
}: Props) {
  const [meta, setMeta] = useState<ChatChannelMeta | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    chatApi
      .getChannelMeta(channelKey)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        setDescription(m.description ?? '');
      })
      .catch(() => {
        if (!cancelled) setMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, channelKey]);

  const saveDescription = async () => {
    setBusy(true);
    try {
      const next = await chatApi.updateChannelMeta(channelKey, {
        description: description.trim() || null,
      });
      setMeta(next);
      onMetaChanged?.(next);
      emitToast('Description saved');
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not save description'));
    } finally {
      setBusy(false);
    }
  };

  const setDisappear = async (sec: number | null) => {
    setBusy(true);
    try {
      const next = await chatApi.updateChannelMeta(channelKey, {
        disappearAfterSec: sec === null ? 0 : sec,
      });
      setMeta(next);
      emitToast(
        sec == null
          ? 'Disappearing messages off'
          : `Messages disappear after ${DISAPPEAR_OPTIONS.find((o) => o.sec === sec)?.label}`,
      );
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not update timer'));
    } finally {
      setBusy(false);
    }
  };

  const pickGroupAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow gallery access to set a group photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      emitToast('Uploading group photo…');
      const next = await chatApi.uploadChannelAvatar(channelKey, {
        uri: asset.uri,
        fileName: asset.fileName ?? `group-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setMeta(next);
      onMetaChanged?.(next);
      emitToast('Group photo updated');
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not upload group photo'));
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => {
    Alert.alert(
      'Clear chat?',
      'Messages will be hidden for you only. Others keep their history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await chatApi.clearChat(channelKey);
                onCleared();
                onClose();
                emitToast('Chat cleared');
              } catch (err) {
                emitToast(apiErrorMessage(err, 'Could not clear chat'));
              }
            })();
          },
        },
      ],
    );
  };

  const avatarUri = resolveMediaUrl(meta?.avatarUrl);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>Chat settings</Text>
          {busy ? (
            <ActivityIndicator color={colors.chrome} style={{ marginVertical: 8 }} />
          ) : null}

          <Pressable style={styles.row} onPress={onStarredFilter}>
            <Text style={styles.rowIcon}>★</Text>
            <Text style={styles.rowLabel}>Starred messages</Text>
          </Pressable>

          <Pressable style={styles.row} onPress={clearChat}>
            <Text style={styles.rowIcon}>⌫</Text>
            <Text style={[styles.rowLabel, styles.danger]}>Clear chat</Text>
          </Pressable>

          <Text style={styles.section}>Disappearing messages</Text>
          <View style={styles.chips}>
            {DISAPPEAR_OPTIONS.map((opt) => {
              const active =
                (opt.sec == null && !meta?.disappearAfterSec) ||
                opt.sec === meta?.disappearAfterSec;
              return (
                <Pressable
                  key={opt.label}
                  style={[styles.chip, active && styles.chipOn]}
                  onPress={() => void setDisappear(opt.sec)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {isGroup ? (
            <>
              <Text style={styles.section}>Group description</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Add a group description"
                placeholderTextColor={colors.textDim}
                maxLength={500}
                multiline
              />
              <Pressable style={styles.saveBtn} onPress={() => void saveDescription()}>
                <Text style={styles.saveText}>Save description</Text>
              </Pressable>

              <Text style={styles.section}>Group photo</Text>
              <Pressable style={styles.avatarRow} onPress={() => void pickGroupAvatar()}>
                <View style={styles.avatar}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarPlaceholder}>📷</Text>
                  )}
                </View>
                <Text style={styles.rowLabel}>Change group photo</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
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
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  title: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 12,
  },
  section: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  danger: { color: '#e57373' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: {
    backgroundColor: colors.chrome,
    borderColor: colors.chrome,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: colors.chromeInk },
  input: {
    minHeight: 72,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    textAlignVertical: 'top',
  },
  saveBtn: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 8 },
  saveText: { color: colors.link, fontWeight: '700' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 22 },
  closeBtn: { alignItems: 'center', paddingTop: 18 },
  closeText: { color: colors.link, fontWeight: '700' },
});
