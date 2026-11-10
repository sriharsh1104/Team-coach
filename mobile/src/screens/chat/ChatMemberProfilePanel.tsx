import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useTheme } from '../../theme/ThemeContext';
import { RoleChips } from '../profile/RoleChips';
import { CopyableField } from '../profile/CopyableField';
import { CopyButton } from '../profile/CopyButton';
import { formatRoleBadge } from '../shared';
import {
  openSocialUrl,
  SocialOpenPlatform,
} from '../../lib/openSocialUrl';
import { ChatFlowHeader } from './ChatFlowHeader';

const SOCIAL_LINKS: Array<{
  key: keyof Profile;
  label: string;
  platform: SocialOpenPlatform;
}> = [
  { key: 'whatsappUrl', label: 'WhatsApp', platform: 'whatsapp' },
  { key: 'instagramUrl', label: 'Instagram', platform: 'instagram' },
  { key: 'discordUrl', label: 'Discord', platform: 'discord' },
  { key: 'youtubeUrl', label: 'YouTube', platform: 'youtube' },
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
  const { colors } = useTheme();
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

  const roleBadge = profile
    ? formatRoleBadge(profile.role, profile.isOwner)
    : null;

  return (
    <View style={styles.root}>
      <ChatFlowHeader title={name} onBack={onBack} />

      {isLoading ? (
        <View style={staticStyles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      ) : error || !profile ? (
        <View style={staticStyles.center}>
          <Text style={styles.error}>{error ?? 'Profile unavailable'}</Text>
        </View>
      ) : (
        <ScrollView
          style={staticStyles.scroll}
          contentContainerStyle={staticStyles.scrollContent}
        >
          <Text style={styles.name}>{name}</Text>
          {roleBadge ? <Text style={styles.badge}>{roleBadge}</Text> : null}

          {profile.roles.length > 0 ? (
            <RoleChips selected={profile.roles} editable={false} />
          ) : (
            <Text style={styles.muted}>No role set yet</Text>
          )}

          {profile.inGameName ? (
            <CopyableField label="In-Game Name (IGN)" value={profile.inGameName} />
          ) : null}
          {profile.inGameUid ? (
            <CopyableField label="UID" value={profile.inGameUid} />
          ) : null}

          <Text style={styles.section}>Social Links</Text>
          {SOCIAL_LINKS.map(({ key, label, platform }) => {
            const url = profile[key] as string | null;
            if (!url) return null;
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
          })}

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
      textAlign: 'center' as const,
      marginBottom: 6,
    },
    badge: {
      color: c.link,
      fontWeight: '600' as const,
      textAlign: 'center' as const,
      marginBottom: 16,
    },
    muted: { color: c.textMuted, marginBottom: 12 },
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
