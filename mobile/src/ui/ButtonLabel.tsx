import React from 'react';
import { StyleSheet, Text, View, TextStyle } from 'react-native';
import { colors } from '../theme';

/** Named glyph keys used across primary action buttons. */
export type AppIconName =
  | 'log-in'
  | 'person-add'
  | 'add-circle'
  | 'enter'
  | 'chat'
  | 'mic'
  | 'mic-off'
  | 'images'
  | 'trophy'
  | 'stats'
  | 'person'
  | 'send'
  | 'save'
  | 'phone'
  | 'upload'
  | 'camera'
  | 'calendar'
  | 'check'
  | 'refresh'
  | 'call'
  | 'google'
  | 'logout'
  | 'people'
  | 'settings'
  | 'trash'
  | 'edit';

const GLYPHS: Record<AppIconName, string> = {
  'log-in': '→',
  'person-add': '＋',
  enter: '↪',
  'add-circle': '＋',
  chat: '◈',
  mic: '◉',
  'mic-off': '⊘',
  images: '▣',
  trophy: '◆',
  stats: '▦',
  person: '☺',
  send: '➤',
  save: '⬇',
  phone: '▭',
  upload: '⬆',
  camera: '◎',
  calendar: '▦',
  check: '✓',
  refresh: '↻',
  call: '✕',
  google: 'G',
  logout: '⎋',
  people: '☺☺',
  settings: '⚙',
  trash: '⊗',
  edit: '✎',
};

/** Icon + label row for chrome / primary action buttons. */
export function ButtonLabel({
  icon,
  children,
  color = colors.chromeInk,
  textStyle,
}: {
  icon: AppIconName;
  children: React.ReactNode;
  color?: string;
  textStyle?: TextStyle;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.glyph, { color }]} accessibilityElementsHidden>
        {GLYPHS[icon]}
      </Text>
      <Text style={[styles.text, { color }, textStyle]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  glyph: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  text: {
    fontWeight: '700',
    fontSize: 16,
  },
});
