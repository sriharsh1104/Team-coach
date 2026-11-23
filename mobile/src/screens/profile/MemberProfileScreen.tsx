import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SkeletonList } from '../../ui/Skeleton';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { roleLabel } from '../../api/roles';
import { CopyableField } from './CopyableField';
import { CopyButton } from './CopyButton';
import { Screen } from '../../brand/Screen';
import { useSharedStyles, formatRoleBadge } from '../shared';
import { MainStackParamList } from '../../navigation/types';
import {
  openSocialUrl,
  SocialOpenPlatform,
} from '../../lib/openSocialUrl';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { usePullToRefresh } from '../../ui/usePullToRefresh';
import { ChannelAvatar } from '../chat/ChannelAvatar';

type Props = NativeStackScreenProps<MainStackParamList, 'MemberProfile'>;

const SOCIAL_LINKS: Array<{
  key: keyof Profile;
  label: string;
  platform: SocialOpenPlatform;
}> = [
  { key: 'whatsappUrl', label: 'WhatsApp', platform: 'whatsapp' },
  { key: 'instagramUrl', label: 'Instagram', platform: 'instagram' },
  { key: 'discordUrl', label: 'Discord', platform: 'discord' },
  { key: 'youtubeUrl', label: 'YouTube', platform: 'youtube' },
  { key: 'kickUrl', label: 'Kick', platform: 'kick' },
];

export function MemberProfileScreen({ route }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(memberProfileStyles);
  const { userId, name } = route.params;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      usersApi
        .getMemberProfile(userId)
        .then((next) => {
          setProfile(next);
          setError(null);
        })
        .catch((err) =>
          setError(err?.response?.data?.message ?? 'Could not load profile'),
        )
        .finally(() => setIsLoading(false)),
    [userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Declared before the loading/error early-returns below so the hook order
  // stays the same on every render.
  const refreshControl = usePullToRefresh(load);

  if (isLoading) {
    return (
      <Screen>
        <View style={[shared.container, { justifyContent: 'flex-start', paddingTop: 24 }]}>
          <SkeletonList count={5} avatarSize={48} />
        </View>
      </Screen>
    );
  }

  if (error || !profile) {
    return (
      <Screen>
        <View style={shared.container}>
          <Text style={shared.error}>{error}</Text>
        </View>
      </Screen>
    );
  }

  const displayName = profile.name?.trim() || name;
  const roleBadge = formatRoleBadge(profile.role, profile.isOwner);
  const inGameRole =
    profile.roles.length > 0
      ? profile.roles.map((r) => roleLabel(r)).join(', ')
      : null;
  const socials = SOCIAL_LINKS.filter(
    ({ key }) => !!(profile[key] as string | null),
  );

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
        refreshControl={refreshControl}
      >
        <View style={staticStyles.headerRow}>
          <ChannelAvatar
            uri={profile.avatarUrl}
            size={72}
            fallback={(displayName[0] ?? '?').toUpperCase()}
            previewable={!!profile.avatarUrl}
          />
          <View style={staticStyles.headerText}>
            <Text style={styles.displayName} numberOfLines={2}>
              {displayName}
            </Text>
            {roleBadge ? (
              <Text style={styles.subtitle}>{roleBadge}</Text>
            ) : null}
            {inGameRole ? (
              <Text style={styles.inGameRole}>{inGameRole}</Text>
            ) : (
              <Text style={styles.muted}>No in-game role set yet</Text>
            )}
          </View>
        </View>

        {profile.inGameName && (
          <CopyableField label="In-Game Name (IGN)" value={profile.inGameName} />
        )}
        {profile.inGameUid && (
          <CopyableField label="UID" value={profile.inGameUid} />
        )}

        <Text style={styles.section}>Social Links</Text>
        {socials.length === 0 ? (
          <Text style={styles.muted}>No social links provided</Text>
        ) : (
          socials.map(({ key, label, platform }) => {
            const url = profile[key] as string;
            return (
              <View key={key} style={staticStyles.linkRow}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => openSocialUrl(url, platform)}
                >
                  <Text style={{ color: colors.link }}>
                    {label}: {url}
                  </Text>
                </Pressable>
                <CopyButton value={url} />
              </View>
            );
          })
        )}

        {profile.devices.length > 0 && (
          <>
            <Text style={styles.section}>Devices</Text>
            {profile.devices.map((device) => (
              <View key={device.id} style={staticStyles.linkRow}>
                <Text style={{ flex: 1, color: colors.text }}>
                  {device.name} — {device.model}
                </Text>
                <CopyButton value={`${device.name} — ${device.model}`} />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function memberProfileStyles(c: ThemeColors) {
  return {
    displayName: {
      color: c.text,
      fontSize: 22,
      fontWeight: '700' as const,
      letterSpacing: -0.3,
    },
    subtitle: {
      color: c.link,
      fontWeight: '600' as const,
      fontSize: 14,
    },
    inGameRole: {
      color: c.textMuted,
      fontWeight: '600' as const,
      fontSize: 13,
    },
    muted: { color: c.textMuted, marginBottom: 4 },
    section: {
      marginTop: 20,
      marginBottom: 8,
      fontWeight: '600' as const,
      color: c.text,
    },
  };
}
