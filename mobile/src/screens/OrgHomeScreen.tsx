import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgDetail } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { useOrgRealtimeOptional } from '../realtime/OrgRealtimeProvider';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { MenuButton, SideDrawer, SideDrawerSection } from '../ui/SideDrawer';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { goToSection } from '../navigation/goToSection';
import { ChatHubScreen } from './chat/ChatHubScreen';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgHome'>;

export function OrgHomeScreen({ navigation }: Props) {
  const { logout, org, user } = useAuth();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const realtime = useOrgRealtimeOptional();
  const insets = useSafeAreaInsets();
  const isOwner = !!org?.isOwner;
  // Owner or coach can manage guild ↔ roster; Guild drawer used to be
  // owner-only so coaches never saw Add/Remove even though the API allows it.
  const canManageGuild = isOwner || !!detail?.canInviteRoster;

  const copyOrgCode = async () => {
    if (!detail?.orgCode) return;
    await Clipboard.setStringAsync(detail.orgCode);
    emitToast('Org code copied');
  };

  const load = useCallback(async () => {
    const data = await orgApi.getMyOrg();
    setDetail(data);
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

  // Mirrors web AppShell: Esports Arena for roster, Guild for owners/coaches,
  // Account for everyone. Plain players do not see Guild.
  const drawerSections = useMemo((): SideDrawerSection[] => {
    const arenaItems = [
      {
        key: 'members',
        label: 'Roster',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Members' }),
      },
      {
        key: 'media',
        label: 'Media',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'MediaFeed' }),
      },
      {
        key: 'stats',
        label: 'Stats & Schedule',
        onPress: () =>
          goToSection(navigation, 'OrgHome', {
            screen: 'Stats',
            params: { mode: 'BR' },
          }),
      },
      {
        key: 'voice',
        label: 'Team Voice',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Voice' }),
      },
      {
        key: 'maps',
        label: 'Maps',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Maps' }),
      },
      {
        key: 'ruleBook',
        label: 'Rule Book',
        onPress: () => goToSection(navigation, 'OrgHome', { screen: 'RuleBook' }),
      },
      {
        key: 'pointsTable',
        label: 'Points Table',
        onPress: () =>
          goToSection(navigation, 'OrgHome', { screen: 'PointsTable' }),
      },
      ...(isOwner
        ? [
            {
              key: 'orgSettings',
              label: 'Org Settings',
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
            label: 'Team Chat',
            // Resets the stack to just OrgHome (which embeds ChatHubScreen)
            // instead of pushing a duplicate — lets Chat be switched back to
            // from anywhere via the drawer, with no back button needed, and
            // without leaving whatever section was open underneath.
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

    if (canManageGuild) {
      sections.push({
        key: 'guild',
        label: 'Guild',
        split: true,
        items: [
          {
            key: 'guildHome',
            label: 'Guild Roster',
            onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Guild' }),
          },
        ],
      });
    }

    sections.push({
      key: 'account',
      label: 'Account',
      split: true,
      items: [
        {
          key: 'profile',
          label: 'Profile',
          onPress: () => goToSection(navigation, 'OrgHome', { screen: 'Profile' }),
        },
        {
          key: 'socialHandles',
          label: 'Social Handles',
          onPress: () =>
            goToSection(navigation, 'OrgHome', { screen: 'SocialHandles' }),
        },
      ],
    });

    return sections;
  }, [navigation, isOwner, canManageGuild]);

  return (
    <Screen padBottom={false}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <MenuButton onPress={() => setMenuOpen(true)} />
        <View style={styles.topBarTitleBlock}>
          <Text style={styles.orgTitle} numberOfLines={1}>
            {org?.name ?? detail?.name ?? 'Team Chat'}
          </Text>
          {detail && (
            <View style={styles.subtitleRow}>
              <SoftPressable
                onPress={copyOrgCode}
                accessibilityRole="button"
                accessibilityLabel="Copy Org Code"
                hitSlop={6}
                pressScale={0.97}
              >
                <Text style={styles.orgCode}>Org Code: {detail.orgCode}</Text>
              </SoftPressable>
              <Text style={styles.subtitle}>
                {' '}
                · {detail.members.length} Member(s)
              </Text>
            </View>
          )}
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
        <ChatHubScreen onLoadError={() => emitToast('Could not load chats')} />
      </View>

      <SideDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Sacred Esports"
        subtitle={org?.name ?? detail?.name ?? user?.name}
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
  orgTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  subtitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 2,
  },
  orgCode: {
    color: colors.link,
    fontSize: 12,
    fontWeight: '600',
  },
  subtitle: { color: colors.textMuted, fontSize: 12 },
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
  chat: { flex: 1 },
});
