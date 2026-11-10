import React, { useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../theme/ThemeContext';
import {
  claimCopyFeedback,
  subscribeCopyFeedback,
} from '../../ui/copyFeedbackBus';

/** Compact copy-to-clipboard control — icon only; flashes a check after copy. */
export function CopyButton({ value }: { value: string }) {
  const id = useId();
  const { colors, themeId } = useTheme();
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    return subscribeCopyFeedback((activeId) => {
      setJustCopied(activeId === id);
    });
  }, [id]);

  const onCopy = async () => {
    if (!value.trim()) return;
    await Clipboard.setStringAsync(value);
    claimCopyFeedback(id);
  };

  // A light green reads on the black theme; light themes need a deeper one.
  const checkColor = themeId === 'black' ? '#4ade80' : '#15803d';

  return (
    <Pressable
      style={[
        styles.btn,
        { backgroundColor: colors.surface, borderColor: colors.border },
        !value.trim() && styles.btnDisabled,
      ]}
      onPress={onCopy}
      disabled={!value.trim()}
      accessibilityRole="button"
      accessibilityLabel={justCopied ? 'Copied' : 'Copy'}
      hitSlop={8}
    >
      <Ionicons
        name={justCopied ? 'checkmark' : 'copy-outline'}
        size={18}
        color={justCopied ? checkColor : colors.icon}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  btnDisabled: { opacity: 0.35 },
});
