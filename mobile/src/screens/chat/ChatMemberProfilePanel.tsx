import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { colors } from '../../theme';
import { SoftPressable } from '../../ui/SoftPressable';
import { RoleChips } from '../profile/RoleChips';
import { CopyableField } from '../profile/CopyableField';
import { CopyButton } from '../profile/CopyButton';
import { formatRoleBadge } from '../shared';

const SOCIAL_LINKS: Array<{ key: keyof Profile; label: string }> = [
  { key: 'whatsappUrl', label: 'WhatsApp' },
  { key: 'instagramUrl', label: 'Instagram' },
  { key: 'discordUrl', label: 'Discord' },
  { key: 'youtubeUrl', label: 'YouTube' },
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
      <View style={styles.header}>
        <SoftPressable
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
          pressScale={0.94}
        >
          <Text style={styles.backLabel}>← Back</Text>
        </SoftPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      ) : error || !profile ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? 'Profile unavailable'}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
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
          {SOCIAL_LINKS.map(({ key, label }) => {
            const url = profile[key] as string | null;
            if (!url) return null;
            return (
              <View key={key} style={styles.linkRow}>
                <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(url)}>
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
                <View key={device.id} style={styles.linkRow}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backLabel: { color: colors.link, fontWeight: '700', fontSize: 13 },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  headerSpacer: { width: 72 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  badge: {
    color: colors.link,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  muted: { color: colors.textMuted, marginBottom: 12 },
  section: {
    marginTop: 20,
    marginBottom: 8,
    fontWeight: '600',
    color: colors.text,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  link: { color: colors.link },
  deviceText: { flex: 1, color: colors.text },
});
