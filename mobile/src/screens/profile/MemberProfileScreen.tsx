import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { RoleChips } from './RoleChips';
import { CopyableField } from './CopyableField';
import { CopyButton } from './CopyButton';
import { Screen } from '../../brand/Screen';
import { sharedStyles } from '../shared';
import { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'MemberProfile'>;

const SOCIAL_LINKS: Array<{ key: keyof Profile; label: string }> = [
  { key: 'whatsappUrl', label: 'WhatsApp' },
  { key: 'instagramUrl', label: 'Instagram' },
  { key: 'discordUrl', label: 'Discord' },
  { key: 'youtubeUrl', label: 'YouTube' },
];

export function MemberProfileScreen({ route }: Props) {
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
        <View style={sharedStyles.container}>
          <ActivityIndicator color="#c9ccd1" />
        </View>
      </Screen>
    );
  }

  if (error || !profile) {
    return (
      <Screen>
        <View style={sharedStyles.container}>
          <Text style={sharedStyles.error}>{error}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
    <ScrollView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ padding: 24 }}
    >
      <Text style={sharedStyles.title}>{name}</Text>

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
      {SOCIAL_LINKS.map(({ key, label }) => {
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
            <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(url)}>
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
