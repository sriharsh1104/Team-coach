import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgDetail } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { MenuButton, SideDrawer } from '../ui/SideDrawer';
import { Toast, useToast } from '../ui/Toast';
import { ChatHubScreen } from './chat/ChatHubScreen';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgHome'>;

export function OrgHomeScreen({ navigation }: Props) {
  const { logout, org, user } = useAuth();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { message: toastMessage, showToast } = useToast();

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
        icon: 'chat' as const,
        onPress: () => {
          // Already on OrgHome which embeds the chat hub.
        },
      },
      {
        key: 'voice',
        label: 'Team Voice',
        icon: 'mic' as const,
        onPress: () => navigation.navigate('Voice'),
      },
      {
        key: 'media',
        label: 'Media',
        icon: 'images' as const,
        onPress: () => navigation.navigate('MediaFeed'),
      },
      {
        key: 'scrims',
        label: 'Scrims & Tournaments',
        icon: 'trophy' as const,
        onPress: () => navigation.navigate('Scrims'),
      },
      {
        key: 'stats',
        label: 'Stats',
        icon: 'stats' as const,
        onPress: () => navigation.navigate('Stats'),
      },
      {
        key: 'members',
        label: 'Team Members',
        icon: 'people' as const,
        onPress: () => navigation.navigate('Members'),
      },
      ...(org?.isOwner
        ? [
            {
              key: 'orgSettings',
              label: 'Org Settings',
              icon: 'settings' as const,
              onPress: () => navigation.navigate('OrgSettings'),
            },
          ]
        : []),
      {
        key: 'profile',
        label: 'Edit My Profile',
        icon: 'person' as const,
        onPress: () => navigation.navigate('Profile'),
      },
    ],
    [navigation, org?.isOwner],
  );

  const footerItems = useMemo(
    () => [
      {
        key: 'logout',
        label: 'Log Out',
        icon: 'logout' as const,
        danger: true,
        onPress: () => logout(),
      },
    ],
    [logout],
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
              <Pressable
                onPress={copyOrgCode}
                accessibilityRole="button"
                accessibilityLabel="Copy Org Code"
                hitSlop={6}
              >
                <Text style={styles.orgCode}>Org Code: {detail.orgCode}</Text>
              </Pressable>
              <Text style={styles.subtitle}>
                {' '}
                · {detail.members.length} Member(s)
              </Text>
            </View>
          )}
        </View>
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
          footerItems={footerItems}
        />
      ) : null}

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
    paddingBottom: 8,
  },
  topBarTitleBlock: { flex: 1, minWidth: 0 },
  orgTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
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
    textDecorationLine: 'underline',
  },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  chat: { flex: 1 },
});
