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
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as chatApi from '../../api/chat';
import { ChatChannelMeta } from '../../api/types';
import { resolveMediaUrl } from '../../api/client';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useTheme } from '../../theme/ThemeContext';
import { emitToast } from '../../ui/toastBus';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { AppIcon, AppIconName } from '../../ui/AppIcon';

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
  muted?: boolean;
  onClose: () => void;
  onCleared: () => void;
  onStarredFilter: () => void;
  onSearch?: () => void;
  onToggleMute?: () => void;
  onOpenMedia?: () => void;
  onMetaChanged?: (meta: ChatChannelMeta) => void;
};

function MenuRow({
  icon,
  label,
  onPress,
  danger,
  colors,
  styles,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof chatSettingsStyles>;
}) {
  return (
    <Pressable
      style={styles.menuRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <AppIcon name={icon} size={20} color={danger ? '#e57373' : colors.icon} />
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
    </Pressable>
  );
}

export function ChatSettingsSheet({
  visible,
  channelKey,
  isGroup,
  muted = false,
  onClose,
  onCleared,
  onStarredFilter,
  onSearch,
  onToggleMute,
  onOpenMedia,
  onMetaChanged,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(chatSettingsStyles);
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
    // Close this sheet first. On Android, launching the gallery/crop activity
    // while an RN <Modal> window is open is unreliable, and toasts render in
    // the app root *behind* the Modal — so progress/success were invisible
    // and the photo looked like it never changed.
    onClose();
    await new Promise((resolve) => setTimeout(resolve, 350));
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
      emitToast('Uploading group photo…', 10000);
      const next = await chatApi.uploadChannelAvatar(channelKey, {
        uri: asset.uri,
        fileName: asset.fileName ?? `group-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setMeta(next);
      onMetaChanged?.(next);

      if (!next.avatarUrl) {
        Alert.alert(
          'Photo not saved',
          'The server did not return a link for the new group photo. Please try again.',
        );
        return;
      }
      emitToast('Group photo updated ✓', 2500);
    } catch (err) {
      const msg = apiErrorMessage(err, 'Could not upload group photo');
      Alert.alert('Upload failed', msg);
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
      <Pressable style={staticStyles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>Chat options</Text>
          {busy ? (
            <ActivityIndicator color={colors.chrome} style={{ marginVertical: 8 }} />
          ) : null}

          <ScrollView
            style={staticStyles.scroll}
            contentContainerStyle={staticStyles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {onSearch ? (
              <MenuRow
                icon="search"
                label="Search"
                onPress={() => {
                  onClose();
                  onSearch();
                }}
                colors={colors}
                styles={styles}
              />
            ) : null}
            {onToggleMute ? (
              <MenuRow
                icon={muted ? 'notifications-off' : 'notifications'}
                label={muted ? 'Unmute' : 'Mute'}
                onPress={() => {
                  onToggleMute();
                  onClose();
                }}
                colors={colors}
                styles={styles}
              />
            ) : null}
            {onOpenMedia ? (
              <MenuRow
                icon="images-outline"
                label="Media"
                onPress={() => {
                  onClose();
                  onOpenMedia();
                }}
                colors={colors}
                styles={styles}
              />
            ) : null}
            <MenuRow
              icon="star"
              label="Starred messages"
              onPress={onStarredFilter}
              colors={colors}
              styles={styles}
            />
            <MenuRow
              icon="trash-outline"
              label="Clear chat"
              onPress={clearChat}
              danger
              colors={colors}
              styles={styles}
            />

            <Text style={styles.section}>Disappearing messages</Text>
            <View style={staticStyles.chips}>
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
                <View style={staticStyles.descriptionRow}>
                  <TextInput
                    style={[styles.input, staticStyles.descriptionInput]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Add a group description"
                    placeholderTextColor={colors.textDim}
                    maxLength={500}
                    multiline
                  />
                  <Pressable
                    style={[styles.actionBtn, styles.saveBtn]}
                    onPress={() => void saveDescription()}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Save description"
                    hitSlop={6}
                  >
                    <AppIcon name="checkmark" size={22} color={colors.chromeInk} />
                  </Pressable>
                </View>

                <Text style={styles.section}>Group photo</Text>
                <Pressable style={staticStyles.avatarRow} onPress={() => void pickGroupAvatar()}>
                  <View style={staticStyles.avatar}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={staticStyles.avatarImg} />
                    ) : (
                      <Text style={staticStyles.avatarPlaceholder}>📷</Text>
                    )}
                  </View>
                  <Text style={styles.rowLabel}>Change group photo</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>

          <Pressable style={staticStyles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
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
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  descriptionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  descriptionInput: { flex: 1 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
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
  closeBtn: { alignItems: 'center', paddingTop: 14 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function chatSettingsStyles(c: ThemeColors) {
  return {
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: 28,
      maxHeight: '88%' as const,
    },
    menuRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 14,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    menuLabel: { color: c.text, fontSize: 15, fontWeight: '600' as const, flex: 1 },
    menuLabelDanger: { color: '#e57373' },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 16,
      marginBottom: 8,
    },
    section: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
      marginTop: 16,
      marginBottom: 8,
    },
    rowLabel: { color: c.text, fontSize: 15, fontWeight: '600' as const },
    actionBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    saveBtn: { backgroundColor: c.chrome, borderColor: c.chrome },
    chipOn: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    chipText: { color: c.text, fontSize: 13, fontWeight: '600' as const },
    chipTextOn: { color: c.chromeInk },
    input: {
      minHeight: 72,
      borderRadius: 10,
      padding: 12,
      color: c.text,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      textAlignVertical: 'top' as const,
    },
    closeText: { color: c.link, fontWeight: '700' as const },
  };
}
