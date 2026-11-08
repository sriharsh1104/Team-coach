import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { ThemeColors } from '../theme';
import { useTheme } from './ThemeContext';

/** Build StyleSheet from live theme — avoids frozen colors from module-load StyleSheet.create. */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (c: ThemeColors) => T,
): T {
  const { colors, themeId } = useTheme();
  return useMemo(() => StyleSheet.create(factory(colors)), [colors, themeId, factory]);
}
