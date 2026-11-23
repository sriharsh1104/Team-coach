import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from './SoftPressable';

/** Compact search bar for member / guild / chat lists. */
export function ListSearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  accessibilityLabel = 'Search',
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(searchStyles);

  return (
    <View style={styles.wrap}>
      <Text style={styles.glyph} accessibilityElementsHidden>
        ⌕
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel}
      />
      {value.length > 0 ? (
        <SoftPressable
          onPress={() => onChangeText('')}
          pressScale={0.92}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Text style={styles.clear}>✕</Text>
        </SoftPressable>
      ) : null}
    </View>
  );
}

function searchStyles(c: ThemeColors) {
  return {
    wrap: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    glyph: {
      color: c.textMuted,
      fontSize: 16,
      fontWeight: '700' as const,
    },
    input: {
      flex: 1,
      color: c.text,
      fontSize: 15,
      padding: 0,
      margin: 0,
    },
    clear: {
      color: c.textMuted,
      fontSize: 14,
      fontWeight: '700' as const,
      paddingHorizontal: 4,
    },
  };
}
