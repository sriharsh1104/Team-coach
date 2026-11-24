import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
} from 'react-native';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useTheme } from '../../theme/ThemeContext';
import { AppIcon, AppIconName } from '../../ui/AppIcon';

type Props = {
  visible: boolean;
  title: string;
  muted: boolean;
  /** DM peer — when set, nickname option is available. */
  peerUserId?: string | null;
  nickname?: string | null;
  onClose: () => void;
  onToggleMute: () => void;
  onSaveNickname?: (nickname: string | null) => void;
};

function MenuRow({
  icon,
  label,
  onPress,
  colors,
  styles,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof sheetStyles>;
}) {
  return (
    <Pressable
      style={styles.menuRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <AppIcon name={icon} size={20} color={colors.icon} />
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Inbox long-press sheet: Mute + optional personal nickname for a DM peer.
 */
export function ConversationOptionsSheet({
  visible,
  title,
  muted,
  peerUserId,
  nickname,
  onClose,
  onToggleMute,
  onSaveNickname,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(sheetStyles);
  const [editingNick, setEditingNick] = useState(false);
  const [draft, setDraft] = useState(nickname ?? '');

  useEffect(() => {
    if (!visible) {
      setEditingNick(false);
      return;
    }
    setDraft(nickname ?? '');
  }, [visible, nickname]);

  const canNickname = !!peerUserId && !!onSaveNickname;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!editingNick ? (
              <>
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
                {canNickname ? (
                  <MenuRow
                    icon="pencil-outline"
                    label={nickname ? 'Edit Nickname' : 'Set Nickname'}
                    onPress={() => setEditingNick(true)}
                    colors={colors}
                    styles={styles}
                  />
                ) : null}
              </>
            ) : (
              <View style={styles.nickBlock}>
                <Text style={[styles.nickHint, { color: colors.textMuted }]}>
                  Only you see this name. Use #Ace or any label you like.
                </Text>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="#Nickname"
                  placeholderTextColor={colors.textMuted}
                  maxLength={32}
                  autoFocus
                  style={[
                    styles.nickInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                    },
                  ]}
                />
                <View style={styles.nickActions}>
                  {nickname ? (
                    <Pressable
                      onPress={() => {
                        onSaveNickname?.(null);
                        onClose();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Clear nickname"
                    >
                      <Text style={[styles.nickAction, { color: '#e57373' }]}>
                        Clear
                      </Text>
                    </Pressable>
                  ) : (
                    <View />
                  )}
                  <View style={styles.nickActionsRight}>
                    <Pressable
                      onPress={() => setEditingNick(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Text
                        style={[styles.nickAction, { color: colors.textMuted }]}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const next = draft.trim();
                        onSaveNickname?.(next || null);
                        onClose();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Save nickname"
                    >
                      <Text style={[styles.nickAction, { color: colors.link }]}>
                        Save
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function sheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 16,
      paddingBottom: 28,
      paddingHorizontal: 8,
      maxHeight: '70%',
    },
    title: {
      fontWeight: '700',
      fontSize: 16,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    menuLabel: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    nickBlock: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 10,
    },
    nickHint: {
      fontSize: 13,
      lineHeight: 18,
    },
    nickInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    nickActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    nickActionsRight: {
      flexDirection: 'row',
      gap: 18,
    },
    nickAction: {
      fontWeight: '700',
      fontSize: 15,
    },
  });
}
