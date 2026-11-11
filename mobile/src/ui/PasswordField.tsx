import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { useSharedStyles } from '../screens/shared';
import { colors } from '../theme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export function PasswordField({
  value,
  onChangeText,
  placeholder = 'Password',
}: Props) {
  const shared = useSharedStyles();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={[shared.input, styles.input]}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
      />
      <Pressable
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((open) => !open)}
        hitSlop={8}
      >
        <AppIcon
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginBottom: 12,
  },
  input: {
    marginBottom: 0,
    paddingRight: 46,
  },
  toggle: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
