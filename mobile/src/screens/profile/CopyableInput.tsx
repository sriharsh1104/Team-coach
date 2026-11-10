import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { useSharedStyles } from '../shared';
import { CopyButton } from './CopyButton';
import { useTheme } from '../../theme/ThemeContext';

/** Text field with a trailing copy icon that copies the current value. */
export function CopyableInput({
  value,
  onChangeText,
  ...rest
}: TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <TextInput
        {...rest}
        style={[shared.input, styles.input, rest.style]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={rest.placeholderTextColor ?? colors.textDim}
      />
      <CopyButton value={value} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  input: { flex: 1, marginBottom: 0 },
});
