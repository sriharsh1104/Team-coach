import React, { useEffect, useId, useState } from 'react';
import { StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../theme/ThemeContext';
import {
  claimCopyFeedback,
  subscribeCopyFeedback,
} from '../../ui/copyFeedbackBus';
import { IconActionButton } from '../../ui/IconActionButton';

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
    <IconActionButton
      icon={justCopied ? 'checkmark' : 'copy-outline'}
      label={justCopied ? 'Copied' : 'Copy'}
      color={justCopied ? checkColor : colors.icon}
      iconSize={18}
      style={styles.btn}
      disabled={!value.trim()}
      onPress={onCopy}
    />
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44 },
});
