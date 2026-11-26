import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
import { achievementsItem } from '../navigation/achievementsDrawerItem';
import { trackerDrawerSection } from '../navigation/trackerDrawerItems';
import { streamingDrawerSection } from '../navigation/streamingDrawerSection';
import { withActiveDrawerItem } from '../navigation/drawerActive';
import { useBlockExitOnRoot } from '../navigation/useBlockExitOnRoot';
import { ExitConfirmModal } from '../ui/ExitConfirmModal';
import { useRecording } from '../recording/RecordingContext';
import { FloatingMainTabBar } from '../ui/FloatingMainTabBar';
import { ChatHubScreen } from './chat/ChatHubScreen';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<MainStackParamList, 'GuildHome'>;

/**
 * Shell for guild-only members (joined guild, not yet on esports roster).
 * Mirrors OrgHome's sidebar so they are not stuck on a bare Guild stack screen.
 */
export function GuildHomeScreen({ navigation }: Props) {
  const { guild, user } = useAuth();
  const { colors: theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [detail, setDetail] = useState<GuildDetail | null>(null);
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
            achievementsItem(navigation, 'GuildHome'),
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
        streamingDrawerSection(navigation, 'GuildHome', startRecording),
        trackerDrawerSection(navigation, 'GuildHome'),
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
        onSettings={() => navigation.navigate('Settings')}
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

      <FloatingMainTabBar
        navigation={navigation}
        home="GuildHome"
        active="chat"
      />

      <SideDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Sacred Esports"
        subtitle={guild?.name ?? user?.name}
        sections={drawerSections}
      />

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
  chat: { flex: 1, minWidth: 0 },
});
