import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgDetail } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { useOrgRealtimeOptional } from '../realtime/OrgRealtimeProvider';
import { Screen } from '../brand/Screen';
import { SideDrawer, SideDrawerSection } from '../ui/SideDrawer';
import { SoftPressable } from '../ui/SoftPressable';
import { AppShellHeader } from '../ui/AppShellHeader';
import { updateOrgHeaderCache } from '../ui/HeaderOrgInfo';
import { emitToast } from '../ui/toastBus';
import { goToSection } from '../navigation/goToSection';
import {
  announcementsItem,
  useUnreadAnnouncements,
} from '../navigation/announcementsDrawerItem';
import { achievementsItem } from '../navigation/achievementsDrawerItem';
import { trackerDrawerSection } from '../navigation/trackerDrawerItems';
import { withActiveDrawerItem } from '../navigation/drawerActive';
import { useBlockExitOnRoot } from '../navigation/useBlockExitOnRoot';
import { ExitConfirmModal } from '../ui/ExitConfirmModal';
import { useRecording } from '../recording/RecordingContext';
import { ChatHubScreen } from './chat/ChatHubScreen';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgHome'>;

export function OrgHomeScreen({ navigation }: Props) {
  const { org, user } = useAuth();
  const { colors: theme } = useTheme();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const realtime = useOrgRealtimeOptional();
  const isOwner = !!org?.isOwner;
  const { exitModalVisible, confirmExit, cancelExit } = useBlockExitOnRoot(navigation);
  const { startRecording } = useRecording();

  const copyOrgCode = async () => {
    if (!detail?.orgCode) return;
    await Clipboard.setStringAsync(detail.orgCode);
    emitToast('Org code copied');
  };

  const load = useCallback(async () => {
    const data = await orgApi.getMyOrg();
    setDetail(data);
    updateOrgHeaderCache(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      void load();
    });
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (event.type === 'members.changed') void load();
    });
  }, [realtime, load]);

  // Mirrors web AppShell: Esports Arena for roster, Guild for everyone in it,
  // Account for everyone. GuildScreen itself limits the accept/add/remove
  // controls to owner, coach, or guild leadership — every member still sees
  // the roster and the join-request queue.
  const unreadAnnouncements = useUnreadAnnouncements(menuOpen, 'OrgHome');

  const drawerSections = useMemo((): SideDrawerSection[] => {
    const arenaItems = [
      {
        key: 'members',
        label: 'Roster',
        icon: 'people-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Members' }),
      },
      {
        key: 'media',
        label: 'Media',
        icon: 'images-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'MediaFeed' }),
      },
      {
        key: 'stats',
        label: 'Stats & Schedule',
        icon: 'bar-chart-outline' as const,
        onPress: () =>
          goToSection(navigation, 'OrgHome', {
            screen: 'Stats',
            params: { mode: 'BR' },
          }),
      },
      {
        key: 'maps',
        label: 'Maps',
        icon: 'map-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Maps' }),
      },
      {
        key: 'ruleBook',
        label: 'Rule Book',
        icon: 'book-outline' as const,
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'RuleBook' }),
      },
      {
        key: 'pointsTable',
        label: 'Points Table',
        icon: 'trophy-outline' as const,
        onPress: () =>
          goToSection(navigation, 'OrgHome', { screen: 'PointsTable' }),
      },
      ...(isOwner
        ? [
            {
              key: 'orgSettings',
              label: 'Org Settings',
              icon: 'settings-outline' as const,
              onPress: () =>
                goToSection(navigation, 'OrgHome', { screen: 'OrgSettings' }),
            },
          ]
        : []),
    ];

    const sections: SideDrawerSection[] = [
      {
        key: 'chat',
        label: 'Chat',
        items: [
          {
            key: 'teamChat',
            label: 'Chat',
            icon: 'chatbubble-outline' as const,
            // Pop/navigate back to OrgHome (embeds ChatHubScreen) so history
            // stays intact for the system back button.
            onPress: () => goToSection(navigation, 'OrgHome'),
          },
        ],
      },
      {
        key: 'arena',
        label: 'Esports Arena',
        split: true,
        items: arenaItems,
      },
    ];

    // Games live under Guild so every guild member can play, and every
    // member can open the Guild Roster too — GuildScreen gates the
    // accept/add/remove controls on its own (owner, coach, or leadership).
    sections.push({
      key: 'guild',
      label: 'Guild',
      split: true,
      items: [
        announcementsItem(navigation, 'OrgHome', unreadAnnouncements),
        achievementsItem(navigation, 'OrgHome'),
        {
          key: 'guildHome',
          label: 'Guild Roster',
          icon: 'people-outline' as const,
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Guild' }),
        },
        {
          key: 'games',
          label: 'Games',
          icon: 'game-controller-outline' as const,
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Games' }),
        },
      ],
    });

    sections.push({
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
    });

    sections.push({
      key: 'live',
      label: 'Live',
      split: true,
      items: [
        {
          key: 'goLive',
          label: 'Go Live',
          icon: 'play' as const,
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'GoLive' }),
        },
      ],
    });

    sections.push(trackerDrawerSection(navigation, 'OrgHome'));

    return withActiveDrawerItem(sections, 'teamChat');
  }, [
    navigation,
    isOwner,
    startRecording,
    unreadAnnouncements,
  ]);

  return (
    <Screen padBottom={false}>
      <AppShellHeader
        title={org?.name ?? detail?.name ?? 'Team Chat'}
        showPing
        onMenu={() => setMenuOpen(true)}
        onSettings={() => navigation.navigate('Settings')}
        subtitle={
          detail ? (
            <View style={styles.subtitleRow}>
              <SoftPressable
                onPress={copyOrgCode}
                accessibilityRole="button"
                accessibilityLabel="Copy Org Code"
                hitSlop={6}
                pressScale={0.97}
              >
                <Text style={[styles.orgCode, { color: theme.link }]}>
                  Org Code: {detail.orgCode}
                </Text>
              </SoftPressable>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                {' '}
                · {detail.members.length} Member(s)
              </Text>
            </View>
          ) : undefined
        }
      />

      <View style={styles.chat}>
        <ChatHubScreen onLoadError={() => emitToast('Could not load chats')} />
      </View>

      <SideDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Sacred Esports"
        subtitle={org?.name ?? detail?.name ?? user?.name}
        sections={drawerSections}
      />

      <ExitConfirmModal
        visible={exitModalVisible}
        onStay={cancelExit}
        onExit={confirmExit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 2,
  },
  orgCode: {
    fontSize: 12,
    fontWeight: '600',
  },
  subtitle: { fontSize: 12 },
  chat: { flex: 1 },
});
