import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { GuildDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { SideDrawer, SideDrawerSection } from '../ui/SideDrawer';
import { SoftPressable } from '../ui/SoftPressable';
import { AppShellHeader } from '../ui/AppShellHeader';
import { Toast, useToast } from '../ui/Toast';
import { goToSection } from '../navigation/goToSection';
import {
  announcementsItem,
  useUnreadAnnouncements,
} from '../navigation/announcementsDrawerItem';
import { withActiveDrawerItem } from '../navigation/drawerActive';
import { useBlockExitOnRoot } from '../navigation/useBlockExitOnRoot';
import { ExitConfirmModal } from '../ui/ExitConfirmModal';
import { useRecording } from '../recording/RecordingContext';
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
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const insets = useSafeAreaInsets();
  const { message: toastMessage, showToast } = useToast();
  const { exitModalVisible, confirmExit, cancelExit } = useBlockExitOnRoot(navigation);
  const { startRecording } = useRecording();

  // Guild-only members had a bare "Guild · Chat" subtitle while roster
  // members got their org identity on Home. Same block here: the guild code
  // (when this member is allowed to share it) and the head count.
  const loadDetail = useCallback(async () => {
    try {
      setDetail(await orgApi.getMyGuild());
    } catch {
      // Header identity is a nicety — the next focus retries.
    }
  }, []);

  useEffect(() => {
    void loadDetail();
    return navigation.addListener('focus', () => void loadDetail());
  }, [navigation, loadDetail]);

  const copyGuildCode = async () => {
    if (!detail?.orgCode) return;
    await Clipboard.setStringAsync(detail.orgCode);
    showToast('Guild code copied');
  };

  const unreadAnnouncements = useUnreadAnnouncements(menuOpen, 'GuildHome');

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
              icon: 'chatbubble-outline' as const,
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
            announcementsItem(navigation, 'GuildHome', unreadAnnouncements),
            {
              key: 'guildHome',
              label: 'Guild Roster',
              icon: 'people-outline' as const,
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'Guild' }),
            },
            {
              key: 'games',
              label: 'Games',
              icon: 'game-controller-outline' as const,
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'Games' }),
            },
          ],
        },
        {
          key: 'tools',
          label: 'Tools',
          split: true,
          items: [
            {
              key: 'recorder',
              label: 'Recorder',
              icon: 'videocam-outline' as const,
              onPress: () => startRecording(),
            },
          ],
        },
        {
          key: 'live',
          label: 'Live',
          split: true,
          items: [
            {
              key: 'goLive',
              label: 'Go Live',
              icon: 'play' as const,
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'GoLive' }),
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
              icon: 'person-outline' as const,
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'Profile' }),
            },
            {
              key: 'socialHandles',
              label: 'Social Handles',
              icon: 'share-social-outline' as const,
              onPress: () =>
                goToSection(navigation, 'GuildHome', { screen: 'SocialHandles' }),
            },
          ],
        },
      ],
      'guildChat',
    );
  }, [navigation, startRecording, unreadAnnouncements]);

  return (
    <Screen padBottom={false}>
      <AppShellHeader
        title={guild?.name ?? detail?.name ?? 'Guild Chat'}
        showPing
        onMenu={() => setMenuOpen(true)}
        onSettings={() => setSettingsMenuOpen(true)}
        subtitle={
          detail ? (
            <View style={styles.subtitleRow}>
              {/* Plain members get no code from the API (leadership only) —
                  show the head count alone rather than an empty label. */}
              {detail.orgCode ? (
                <SoftPressable
                  onPress={() => void copyGuildCode()}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Guild Code"
                  hitSlop={6}
                  pressScale={0.97}
                >
                  <Text style={[styles.guildCode, { color: theme.link }]}>
                    Guild Code: {detail.orgCode}
                  </Text>
                </SoftPressable>
              ) : null}
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                {detail.orgCode ? ' · ' : ''}
                {detail.members.length} Member(s)
              </Text>
            </View>
          ) : (
            'Guild · Chat'
          )
        }
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

      <ExitConfirmModal
        visible={exitModalVisible}
        onStay={cancelExit}
        onExit={confirmExit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitleRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  guildCode: { fontSize: 11, fontWeight: '700' },
  subtitle: { fontSize: 11 },
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
