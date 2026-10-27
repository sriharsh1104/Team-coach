import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { RoleOption } from '../../api/roles';
import { RoleChips } from './RoleChips';
import { CopyableInput } from './CopyableInput';
import { CopyButton } from './CopyButton';
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { sharedStyles } from '../shared';

export function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [roles, setRoles] = useState<string[]>([]);
  const [inGameName, setInGameName] = useState('');
  const [inGameUid, setInGameUid] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const [deviceName, setDeviceName] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [isAddingDevice, setIsAddingDevice] = useState(false);

  const load = useCallback(async () => {
    const data = await usersApi.getMyProfile();
    setProfile(data);
    setRoles(data.roles);
    setInGameName(data.inGameName ?? '');
    setInGameUid(data.inGameUid ?? '');
    setWhatsappUrl(data.whatsappUrl ?? '');
    setInstagramUrl(data.instagramUrl ?? '');
    setDiscordUrl(data.discordUrl ?? '');
    setYoutubeUrl(data.youtubeUrl ?? '');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRole = (role: RoleOption) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const onSave = async () => {
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        roles,
        inGameName: inGameName || undefined,
        inGameUid: inGameUid || undefined,
        whatsappUrl: whatsappUrl || undefined,
        instagramUrl: instagramUrl || undefined,
        discordUrl: discordUrl || undefined,
        youtubeUrl: youtubeUrl || undefined,
      });
      setProfile(updated);
      Alert.alert('Saved', 'Your profile was updated.');
    } catch (err: any) {
      Alert.alert(
        'Could not save',
        err?.response?.data?.message?.toString() ?? 'Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const onAddDevice = async () => {
    if (!deviceName || !deviceModel) return;
    setIsAddingDevice(true);
    try {
      await usersApi.addDevice(deviceName.trim(), deviceModel.trim());
      setDeviceName('');
      setDeviceModel('');
      await load();
    } catch (err: any) {
      Alert.alert('Could not add device', err?.response?.data?.message ?? '');
    } finally {
      setIsAddingDevice(false);
    }
  };

  const onRemoveDevice = async (id: string) => {
    await usersApi.removeDevice(id);
    await load();
  };

  if (isLoading || !profile) {
    return (
      <Screen>
        <View style={sharedStyles.container}>
          <ActivityIndicator color="#c9ccd1" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>Role(s)</Text>
        <RoleChips selected={roles} onToggle={toggleRole} />

        <Text style={styles.sectionLabel}>In-Game Name (IGN)</Text>
        <CopyableInput
          placeholder="Your in-game name"
          value={inGameName}
          onChangeText={setInGameName}
        />

        <Text style={styles.sectionLabel}>UID</Text>
        <CopyableInput
          placeholder="Your in-game UID"
          value={inGameUid}
          onChangeText={setInGameUid}
        />

        <Text style={styles.sectionLabel}>Social Links</Text>
        <CopyableInput
          placeholder="WhatsApp URL"
          autoCapitalize="none"
          value={whatsappUrl}
          onChangeText={setWhatsappUrl}
        />
        <CopyableInput
          placeholder="Instagram URL"
          autoCapitalize="none"
          value={instagramUrl}
          onChangeText={setInstagramUrl}
        />
        <CopyableInput
          placeholder="Discord URL"
          autoCapitalize="none"
          value={discordUrl}
          onChangeText={setDiscordUrl}
        />
        <CopyableInput
          placeholder="YouTube URL"
          autoCapitalize="none"
          value={youtubeUrl}
          onChangeText={setYoutubeUrl}
        />

        <Pressable
          style={[sharedStyles.button, isSaving && sharedStyles.buttonDisabled]}
          disabled={isSaving}
          onPress={onSave}
        >
          <ButtonLabel icon="save">
            {isSaving ? 'Saving…' : 'Save Profile'}
          </ButtonLabel>
        </Pressable>

        <Text style={styles.sectionLabel}>My Devices</Text>
        {profile.devices.map((device) => (
          <View key={device.id} style={styles.deviceRow}>
            <Text style={{ flex: 1, color: '#f2f3f5' }}>
              {device.name} — {device.model}
            </Text>
            <CopyButton value={`${device.name} — ${device.model}`} />
            <Pressable onPress={() => onRemoveDevice(device.id)} hitSlop={8}>
              <Text style={{ color: '#f87171' }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <CopyableInput
          placeholder="Device name (e.g. Main rig)"
          value={deviceName}
          onChangeText={setDeviceName}
        />
        <CopyableInput
          placeholder="Device model (e.g. ROG Phone 8)"
          value={deviceModel}
          onChangeText={setDeviceModel}
        />
        <Pressable
          style={[
            sharedStyles.button,
            (!deviceName || !deviceModel || isAddingDevice) &&
              sharedStyles.buttonDisabled,
          ]}
          disabled={!deviceName || !deviceModel || isAddingDevice}
          onPress={onAddDevice}
        >
          <ButtonLabel icon="phone">Add Device</ButtonLabel>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: 20,
    marginBottom: 8,
    fontWeight: '600',
    color: '#e8eaed',
    textTransform: 'capitalize',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
});
