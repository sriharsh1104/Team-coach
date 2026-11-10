import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME_OPTIONS, ThemeId } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { SoftPressable } from './SoftPressable';

/**
 * The Home header's settings gear (Security / Theme / Logout), packaged for
 * the native-stack headerRight so every section screen carries the same
 * controls — not just OrgHome.
 */
export function HeaderSettingsButton() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors: theme, themeId, setTheme } = useTheme();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  return (
    <>
      <SoftPressable
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Account Settings"
        hitSlop={8}
        style={[styles.gearBtn, { backgroundColor: theme.surface }]}
        pressScale={0.9}
      >
        <Text style={[styles.gearIcon, { color: theme.icon }]}>⚙</Text>
      </SoftPressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.root}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close Account Settings Menu"
          />
          <View
            style={[
              styles.panel,
              {
                top: insets.top + 56,
                backgroundColor: theme.bg,
                borderColor: theme.border,
              },
            ]}
          >
            <SoftPressable
              style={styles.item}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('AccountSettings');
              }}
              pressScale={0.97}
            >
              <Text style={[styles.itemText, { color: theme.text }]}>
                Security
              </Text>
            </SoftPressable>
            <SoftPressable
              style={styles.item}
              onPress={() => {
                setMenuOpen(false);
                setThemePickerOpen(true);
              }}
              pressScale={0.97}
            >
              <Text style={[styles.itemText, { color: theme.text }]}>
                Theme
              </Text>
            </SoftPressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SoftPressable
              style={styles.item}
              onPress={() => {
                setMenuOpen(false);
                logout();
              }}
              pressScale={0.97}
            >
              <Text style={[styles.itemText, { color: theme.danger }]}>
                Logout
              </Text>
            </SoftPressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={themePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setThemePickerOpen(false)}
      >
        <View style={styles.root}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setThemePickerOpen(false)}
            accessibilityLabel="Close Theme Picker"
          />
          <View
            style={[
              styles.panel,
              {
                top: insets.top + 56,
                backgroundColor: theme.bg,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.themeHeading, { color: theme.textMuted }]}>
              Theme
            </Text>
            {THEME_OPTIONS.map((opt) => {
              const active = themeId === opt.id;
              return (
                <SoftPressable
                  key={opt.id}
                  style={styles.themeRow}
                  onPress={() => {
                    setTheme(opt.id as ThemeId);
                    setThemePickerOpen(false);
                  }}
                  pressScale={0.97}
                >
                  <View
                    style={[
                      styles.themeSwatch,
                      { backgroundColor: opt.swatch, borderColor: theme.border },
                    ]}
                  />
                  <Text style={[styles.itemText, { color: theme.text }]}>
                    {opt.label}
                  </Text>
                  {active ? (
                    <Text style={[styles.themeCheck, { color: theme.link }]}>
                      ✓
                    </Text>
                  ) : null}
                </SoftPressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: { fontSize: 18 },
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    position: 'absolute',
    right: 16,
    minWidth: 180,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  item: {
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  itemText: {
    fontWeight: '700',
    fontSize: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  themeHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  themeSwatch: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 1,
  },
  themeCheck: {
    marginLeft: 'auto',
    fontSize: 15,
    fontWeight: '800',
  },
});
