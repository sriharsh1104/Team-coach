import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { SideDrawer, SideDrawerSection } from '../ui/SideDrawer';
import { SoftPressable } from '../ui/SoftPressable';
import { AppShellHeader } from '../ui/AppShellHeader';
import { Toast, useToast } from '../ui/Toast';
import { goToSection } from '../navigation/goToSection';
import { withActiveDrawerItem } from '../navigation/drawerActive';
import { useBlockExitOnRoot } from '../navigation/useBlockExitOnRoot';
import { ChatHubScreen } from './chat/ChatHubScreen';
import { useTheme } from '../theme/ThemeContext';
import { THEME_OPTIONS, ThemeId } from '../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'GuildHome'>;

/**
 * Shell for guild-only members (joined guild, not yet on esports roster).
 * Mirrors OrgHome's sidebar so they are not stuck on a bare Guild stack screen.
 */
export function GuildHomeScreen({ navigation }: Props) {
  const { logout, guild, user } = useAuth();
  const { themeId, setTheme, colors: theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { message: toastMessage, showToast } = useToast();
  useBlockExitOnRoot(navigation);

  const drawerSections = useMemo((): SideDrawerSection[] => {
    return withActiveDrawerItem(
      [
        {
          key: 'chat',
          label: 'Chat',
          items: [
            {
              key: 'guildChat',
              label: 'Guild Chat',
              // Navigate/pop back to GuildHome (embeds ChatHubScreen) so the
              // system back button can reverse the same path.
              onPress: () => goToSection(navigation, 'GuildHome'),
            },
          ],
        },
        {
          key: 'guild',
          label: 'Guild',
          split: true,
          items: [
            {
              key: 'guildHome',
              label: 'Guild Roster',
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'Guild' }),
            },
          ],
        },
        {
          key: 'account',
          label: 'Account',
          split: true,
          items: [
            {
              key: 'profile',
              label: 'Profile',
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'Profile' }),
            },
            {
              key: 'socialHandles',
              label: 'Social Handles',
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'SocialHandles' }),
            },
          ],
        },
      ],
      'guildChat',
    );
  }, [navigation]);

  return (
    <Screen padBottom={false}>
      <AppShellHeader
        title={guild?.name ?? 'Guild Chat'}
        subtitle="Guild · Chat"
        onMenu={() => setMenuOpen(true)}
        onSettings={() => setSettingsMenuOpen(true)}
      />

      <View style={styles.chat}>
        <ChatHubScreen onLoadError={() => showToast('Could not load chats')} />
      </View>

      <SideDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Sacred Esports"
        subtitle={guild?.name ?? user?.name}
        sections={drawerSections}
      />

      <Modal
        visible={settingsMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsMenuOpen(false)}
      >
        <View style={styles.dropdownRoot}>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setSettingsMenuOpen(false)}
            accessibilityLabel="Close Account Settings Menu"
          />
          <View
            style={[
              styles.dropdownPanel,
              {
                top: insets.top + 56,
                backgroundColor: theme.bg,
                borderColor: theme.border,
              },
            ]}
          >
            <SoftPressable
              style={styles.dropdownItem}
              onPress={() => {
                setSettingsMenuOpen(false);
                navigation.navigate('AccountSettings');
              }}
              pressScale={0.97}
            >
              <Text style={[styles.dropdownItemText, { color: theme.text }]}>
                Security
              </Text>
            </SoftPressable>
            <SoftPressable
              style={styles.dropdownItem}
              onPress={() => {
                setSettingsMenuOpen(false);
                setThemePickerOpen(true);
              }}
              pressScale={0.97}
            >
              <Text style={[styles.dropdownItemText, { color: theme.text }]}>
                Theme
              </Text>
            </SoftPressable>
            <View
              style={[styles.dropdownDivider, { backgroundColor: theme.border }]}
            />
            <SoftPressable
              style={styles.dropdownItem}
              onPress={() => {
                setSettingsMenuOpen(false);
                logout();
              }}
              pressScale={0.97}
            >
              <Text style={[styles.dropdownItemText, { color: theme.danger }]}>
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
        <View style={styles.dropdownRoot}>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setThemePickerOpen(false)}
            accessibilityLabel="Close Theme Picker"
          />
          <View
            style={[
              styles.dropdownPanel,
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
                      {
                        backgroundColor: opt.swatch,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                  <Text style={[styles.dropdownItemText, { color: theme.text }]}>
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

      <Toast message={toastMessage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dropdownRoot: { flex: 1 },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dropdownPanel: {
    position: 'absolute',
    right: 16,
    minWidth: 180,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontWeight: '700',
    fontSize: 15,
  },
  dropdownDivider: {
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
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  themeSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
  },
  themeCheck: { marginLeft: 'auto', fontWeight: '800' },
  chat: { flex: 1, minWidth: 0 },
});
