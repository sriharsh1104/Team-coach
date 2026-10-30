import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgDetail } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { MenuButton, SideDrawer } from '../ui/SideDrawer';
import { SoftPressable } from '../ui/SoftPressable';
import { Toast, useToast } from '../ui/Toast';
import { ChatHubScreen } from './chat/ChatHubScreen';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgHome'>;

export function OrgHomeScreen({ navigation }: Props) {
  const { logout, org, user } = useAuth();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const { message: toastMessage, showToast } = useToast();
  const insets = useSafeAreaInsets();

  const copyOrgCode = async () => {
    if (!detail?.orgCode) return;
    await Clipboard.setStringAsync(detail.orgCode);
    showToast('Org code copied');
  };

  const load = useCallback(async () => {
    const data = await orgApi.getMyOrg();
    setDetail(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const drawerItems = useMemo(
    () => [
      {
        key: 'chat',
        label: 'Chats',
        onPress: () => {
          // Already on OrgHome which embeds the chat hub.
        },
      },
      {
        key: 'voice',
        label: 'Team Voice',
        onPress: () => navigation.navigate('Voice'),
      },
      {
        key: 'media',
        label: 'Media',
        onPress: () => navigation.navigate('MediaFeed'),
      },
      {
        key: 'stats',
        label: 'Stats & Schedule',
        onPress: () => navigation.navigate('Stats', { mode: 'BR' }),
      },
      {
        key: 'members',
        label: 'Team Members',
        onPress: () => navigation.navigate('Members'),
      },
      ...(org?.isOwner
        ? [
            {
              key: 'orgSettings',
              label: 'Org Settings',
              onPress: () => navigation.navigate('OrgSettings'),
            },
          ]
        : []),
      {
        key: 'profile',
        label: 'Profile',
        onPress: () => navigation.navigate('Profile'),
      },
      {
        key: 'ruleBook',
        label: 'Rule Book',
        onPress: () => navigation.navigate('RuleBook'),
      },
      {
        key: 'socialHandles',
        label: 'Social Handles',
        onPress: () => navigation.navigate('SocialHandles'),
      },
    ],
    [navigation, org?.isOwner],
  );

  return (
    <Screen>
      <View style={styles.topBar}>
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
        <ChatHubScreen onLoadError={() => showToast('Could not load chats')} />
      </View>

      {menuOpen ? (
        <SideDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={user?.name ?? 'Menu'}
          subtitle={org?.name ?? detail?.name}
          items={drawerItems}
        />
      ) : null}

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
    paddingTop: 12,
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
