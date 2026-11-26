import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { SoftPressable } from './SoftPressable';

/**
 * Native-stack headerRight gear — opens the unified Settings hub.
 */
export function HeaderSettingsButton() {
  const navigation = useNavigation<any>();
  const { colors: theme } = useTheme();

  return (
    <SoftPressable
      onPress={() => navigation.navigate('Settings')}
      accessibilityRole="button"
      accessibilityLabel="Account Settings"
      hitSlop={8}
      style={styles.gearBtn}
      pressScale={0.9}
    >
      <Text style={[styles.gearIcon, { color: theme.icon }]}>⚙</Text>
    </SoftPressable>
  );
}

const styles = StyleSheet.create({
  gearBtn: {
    width: 36,
    alignSelf: 'stretch',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  gearIcon: { fontSize: 20 },
});
