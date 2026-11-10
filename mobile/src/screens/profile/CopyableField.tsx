import React from 'react';
import { View, Text } from 'react-native';
import { CopyButton } from './CopyButton';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

export function CopyableField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const styles = useThemedStyles(fieldStyles);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <CopyButton value={value} />
    </View>
  );
}

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function fieldStyles(c: ThemeColors) {
  return {
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    label: { color: c.textMuted, fontSize: 12 },
    value: { fontSize: 16, marginTop: 2, color: c.text },
  };
}
