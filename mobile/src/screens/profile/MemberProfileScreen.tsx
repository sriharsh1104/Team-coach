import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { RoleChips } from './RoleChips';
import { CopyableField } from './CopyableField';
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
      <View style={sharedStyles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={sharedStyles.container}>
        <Text style={sharedStyles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ padding: 24 }}
    >
      <Text style={sharedStyles.title}>{name}</Text>

      {profile.roles.length > 0 ? (
        <RoleChips
          selected={profile.roles}
          editable={false}
        />
      ) : (
        <Text style={{ color: '#888', marginBottom: 12 }}>No role set yet</Text>
      )}

      {profile.inGameName && (
        <CopyableField label="In-game name (IGN)" value={profile.inGameName} />
      )}
      {profile.inGameUid && (
        <CopyableField label="UID" value={profile.inGameUid} />
      )}

      <Text style={{ marginTop: 20, marginBottom: 8, fontWeight: '600' }}>
        Social links
      </Text>
      {SOCIAL_LINKS.map(({ key, label }) => {
        const url = profile[key] as string | null;
        if (!url) return null;
        return (
          <Pressable key={key} onPress={() => Linking.openURL(url)}>
            <Text style={{ color: '#2563eb', marginBottom: 8 }}>
              {label}: {url}
            </Text>
          </Pressable>
        );
      })}

      {profile.devices.length > 0 && (
        <>
          <Text style={{ marginTop: 20, marginBottom: 8, fontWeight: '600' }}>
            Devices
          </Text>
          {profile.devices.map((device) => (
            <Text key={device.id} style={{ marginBottom: 6 }}>
              {device.name} — {device.model}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}
