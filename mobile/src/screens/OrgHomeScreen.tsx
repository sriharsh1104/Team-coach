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
import { SideDrawer, SideDrawerSection } from '../ui/SideDrawer';
import { SoftPressable } from '../ui/SoftPressable';
import { AppShellHeader } from '../ui/AppShellHeader';
import { emitToast } from '../ui/toastBus';
import { goToSection } from '../navigation/goToSection';
import { withActiveDrawerItem } from '../navigation/drawerActive';
import { useBlockExitOnRoot } from '../navigation/useBlockExitOnRoot';
import { ChatHubScreen } from './chat/ChatHubScreen';
import { useTheme } from '../theme/ThemeContext';
import { THEME_OPTIONS, ThemeId } from '../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgHome'>;

export function OrgHomeScreen({ navigation }: Props) {
  const { logout, org, user } = useAuth();
  const { themeId, setTheme, colors: theme } = useTheme();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const realtime = useOrgRealtimeOptional();
  const insets = useSafeAreaInsets();
  const isOwner = !!org?.isOwner;
  useBlockExitOnRoot(navigation);
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

    return withActiveDrawerItem(sections, 'teamChat');
  }, [navigation, isOwner, canManageGuild]);

  return (
    <Screen padBottom={false}>
      <AppShellHeader
        title={org?.name ?? detail?.name ?? 'Team Chat'}
        onMenu={() => setMenuOpen(true)}
        onSettings={() => setSettingsMenuOpen(true)}
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
  chat: { flex: 1 },
});
