import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { MenuButton, SideDrawer, SideDrawerSection } from '../ui/SideDrawer';
import { SoftPressable } from '../ui/SoftPressable';
import { Toast, useToast } from '../ui/Toast';
import { goToSection } from '../navigation/goToSection';
import { ChatHubScreen } from './chat/ChatHubScreen';

type Props = NativeStackScreenProps<MainStackParamList, 'GuildHome'>;

/**
 * Shell for guild-only members (joined guild, not yet on esports roster).
 * Mirrors OrgHome's sidebar so they are not stuck on a bare Guild stack screen.
 */
export function GuildHomeScreen({ navigation }: Props) {
  const { logout, guild, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { message: toastMessage, showToast } = useToast();

  const drawerSections = useMemo((): SideDrawerSection[] => {
    return [
      {
        key: 'chat',
        label: 'Chat',
        items: [
          {
            key: 'guildChat',
            label: 'Guild Chat',
            // Resets the stack to just GuildHome (which embeds ChatHubScreen)
            // instead of pushing a duplicate — lets Chat be switched back to
            // from anywhere via the drawer, with no back button needed, and
            // without leaving whatever section was open underneath.
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
            key: 'guildRoster',
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
    ];
  }, [navigation]);

  return (
    <Screen padBottom={false}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <MenuButton onPress={() => setMenuOpen(true)} />
        <View style={styles.topBarTitleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {guild?.name ?? 'Guild Chat'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Guild · Chat
          </Text>
        </View>
        <SoftPressable
          onPress={() => setSettingsMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Account Settings"
          hitSlop={8}
          style={styles.settingsBtn}
          pressScale={0.9}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </SoftPressable>
      </View>

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
          <View style={[styles.dropdownPanel, { top: insets.top + 56 }]}>
            <SoftPressable
              style={styles.dropdownItem}
              onPress={() => {
                setSettingsMenuOpen(false);
                navigation.navigate('AccountSettings');
              }}
              pressScale={0.97}
            >
              <Text style={styles.dropdownItemText}>Security</Text>
            </SoftPressable>
            <View style={styles.dropdownDivider} />
            <SoftPressable
              style={styles.dropdownItem}
              onPress={() => {
                setSettingsMenuOpen(false);
                logout();
              }}
              pressScale={0.97}
            >
              <Text style={[styles.dropdownItemText, { color: colors.danger }]}>
                Logout
              </Text>
            </SoftPressable>
          </View>
        </View>
      </Modal>

      <Toast message={toastMessage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  topBarTitleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  settingsIcon: { fontSize: 18, color: colors.text },
  dropdownRoot: { flex: 1 },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dropdownPanel: {
    position: 'absolute',
    right: 16,
    minWidth: 180,
    backgroundColor: '#121216',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  chat: { flex: 1, minWidth: 0 },
});
