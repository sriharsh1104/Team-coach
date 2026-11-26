import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as usersApi from '../../api/users';
import { GameProfile, Profile } from '../../api/types';
import { roleLabel } from '../../api/roles';
import { gameLabel, gameRoleLabel } from '../../api/profileGames';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { CopyableField } from '../profile/CopyableField';
import { CopyButton } from '../profile/CopyButton';
import { SkeletonList } from '../../ui/Skeleton';
import { formatRoleBadge } from '../shared';
import {
  openSocialUrl,
  SocialOpenPlatform,
} from '../../lib/openSocialUrl';
import { ChatFlowHeader } from './ChatFlowHeader';
import { ChannelAvatar } from './ChannelAvatar';

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

/** Profile sheet used inside ChatHub’s local back stack (not MainStack). */
export function ChatMemberProfilePanel({
  userId,
  name,
  onBack,
}: {
  userId: string;
  name: string;
  onBack: () => void;
}) {
  const styles = useThemedStyles(memberProfileStyles);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    usersApi
      .getMemberProfile(userId)
      .then(setProfile)
      .catch((err) =>
        setError(err?.response?.data?.message ?? 'Could not load profile'),
      )
      .finally(() => setIsLoading(false));
  }, [userId]);

  const displayName = profile?.name?.trim() || name;
  const roleBadge = profile
    ? formatRoleBadge(profile.role, profile.isOwner)
    : null;
  const games: GameProfile[] = !profile
    ? []
    : profile.gameProfiles && profile.gameProfiles.length > 0
      ? profile.gameProfiles
      : profile.inGameName || profile.inGameUid || profile.roles[0]
        ? [
            {
              game: 'FREE_FIRE',
              inGameName: profile.inGameName,
              inGameUid: profile.inGameUid,
              role: profile.roles[0] ?? null,
            },
          ]
        : [];
  const headerRole = games[0]?.role
    ? gameRoleLabel(games[0].role)
    : profile && profile.roles.length > 0
      ? profile.roles.map((r) => roleLabel(r)).join(', ')
      : null;
  const socials = profile
    ? SOCIAL_LINKS.filter(({ key }) => !!(profile[key] as string | null))
    : [];

  return (
    <View style={styles.root}>
      <ChatFlowHeader title={displayName} onBack={onBack} />

      {isLoading ? (
        <SkeletonList
          count={5}
          avatarSize={48}
          style={{ paddingHorizontal: 16, paddingTop: 12 }}
        />
      ) : error || !profile ? (
        <View style={staticStyles.center}>
          <Text style={styles.error}>{error ?? 'Profile unavailable'}</Text>
        </View>
      ) : (
        <ScrollView
          style={staticStyles.scroll}
          contentContainerStyle={staticStyles.scrollContent}
        >
          <View style={staticStyles.headerRow}>
            <ChannelAvatar
              uri={profile.avatarUrl}
              size={72}
              fallback={(displayName[0] ?? '?').toUpperCase()}
              previewable={!!profile.avatarUrl}
            />
            <View style={staticStyles.headerText}>
              <Text style={styles.name} numberOfLines={2}>
                {displayName}
              </Text>
              {roleBadge ? <Text style={styles.badge}>{roleBadge}</Text> : null}
              {headerRole ? (
                <Text style={styles.inGameRole}>{headerRole}</Text>
              ) : (
                <Text style={styles.muted}>No in-game role set yet</Text>
              )}
            </View>
          </View>

          {games.map((row) => (
            <View key={row.game} style={{ marginBottom: 8 }}>
              <Text style={styles.section}>{gameLabel(row.game)}</Text>
              {row.role ? (
                <Text style={styles.inGameRole}>{gameRoleLabel(row.role)}</Text>
              ) : null}
              {row.inGameName ? (
                <CopyableField label="In-Game Name (IGN)" value={row.inGameName} />
              ) : null}
              {row.inGameUid ? (
                <CopyableField
                  label={row.game === 'LOL' ? 'Riot ID / UID' : 'UID'}
                  value={row.inGameUid}
                />
              ) : null}
            </View>
          ))}
          {profile.phone ? (
            <CopyableField
              label={
                profile.phoneVerifiedAt ? 'Phone (verified)' : 'Phone'
              }
              value={profile.phone}
            />
          ) : null}

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
                    <Text style={styles.link}>
                      {label}: {url}
                    </Text>
                  </Pressable>
                  <CopyButton value={url} />
                </View>
              );
            })
          )}

          {profile.devices.length > 0 ? (
            <>
              <Text style={styles.section}>Devices</Text>
              {profile.devices.map((device) => (
                <View key={device.id} style={staticStyles.linkRow}>
                  <Text style={styles.deviceText}>
                    {device.name} — {device.model}
                  </Text>
                  <CopyButton value={`${device.name} — ${device.model}`} />
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
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
    root: { flex: 1, backgroundColor: c.bg },
    error: { color: c.danger, textAlign: 'center' as const },
    name: {
      color: c.text,
      fontSize: 22,
      fontWeight: '700' as const,
      letterSpacing: -0.3,
    },
    badge: {
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
    link: { color: c.link },
    deviceText: { flex: 1, color: c.text },
  };
}
