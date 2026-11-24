import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { useSharedStyles } from '../screens/shared';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  /** Start revealed (default: hidden). */
  initiallyVisible?: boolean;
  accessibilityLabelShow?: string;
  accessibilityLabelHide?: string;
};

/** Text field with eye toggle — for stream URLs/keys and other secrets. */
export function SecretField({
  value,
  onChangeText,
  placeholder,
  editable = true,
  initiallyVisible = false,
  accessibilityLabelShow = 'Show',
  accessibilityLabelHide = 'Hide',
}: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(initiallyVisible);

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
        editable={editable}
      />
      <Pressable
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={visible ? accessibilityLabelHide : accessibilityLabelShow}
        onPress={() => setVisible((open) => !open)}
        hitSlop={8}
        disabled={!editable && !value}
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
