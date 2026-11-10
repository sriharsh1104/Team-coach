import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { RoleChips } from './RoleChips';
import { CopyableField } from './CopyableField';
import { CopyButton } from './CopyButton';
import { Screen } from '../../brand/Screen';
import { useSharedStyles, formatRoleBadge } from '../shared';
import { MainStackParamList } from '../../navigation/types';
import {
  openSocialUrl,
  SocialOpenPlatform,
} from '../../lib/openSocialUrl';

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
];

export function MemberProfileScreen({ route }: Props) {
  const shared = useSharedStyles();
  const { userId, name } = route.params;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    usersApi
      .getMemberProfile(userId)
      .then(setProfile)
      .catch((err) =>
        setError(err?.response?.data?.message ?? 'Could not load profile'),
      )
      .finally(() => setIsLoading(false));
  }, [userId]);

  if (isLoading) {
    return (
      <Screen>
        <View style={shared.container}>
          <ActivityIndicator color="#c9ccd1" />
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

  const roleBadge = formatRoleBadge(profile.role, profile.isOwner);

  return (
    <Screen>
    <ScrollView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ padding: 24 }}
    >
      <Text style={shared.title}>{name}</Text>
      {roleBadge && (
        <Text
          style={{
            color: '#a8b0ff',
            fontWeight: '600',
            textAlign: 'center',
            marginTop: -16,
            marginBottom: 16,
          }}
        >
          {roleBadge}
        </Text>
      )}

      {profile.roles.length > 0 ? (
        <RoleChips
          selected={profile.roles}
          editable={false}
        />
      ) : (
        <Text style={{ color: '#9aa0a6', marginBottom: 12 }}>No role set yet</Text>
      )}

      {profile.inGameName && (
        <CopyableField label="In-Game Name (IGN)" value={profile.inGameName} />
      )}
      {profile.inGameUid && (
        <CopyableField label="UID" value={profile.inGameUid} />
      )}

      <Text style={{ marginTop: 20, marginBottom: 8, fontWeight: '600', color: '#e8eaed' }}>
        Social Links
      </Text>
      {SOCIAL_LINKS.map(({ key, label, platform }) => {
        const url = profile[key] as string | null;
        if (!url) return null;
        return (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={() => openSocialUrl(url, platform)}
            >
              <Text style={{ color: '#a8b0ff' }}>
                {label}: {url}
              </Text>
            </Pressable>
            <CopyButton value={url} />
          </View>
        );
      })}

      {profile.devices.length > 0 && (
        <>
          <Text style={{ marginTop: 20, marginBottom: 8, fontWeight: '600', color: '#e8eaed' }}>
            Devices
          </Text>
          {profile.devices.map((device) => (
            <View
              key={device.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Text style={{ flex: 1, color: '#f2f3f5' }}>
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
