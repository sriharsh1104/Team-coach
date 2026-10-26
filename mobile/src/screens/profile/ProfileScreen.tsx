import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { RoleOption } from '../../api/roles';
import { RoleChips } from './RoleChips';
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

  const copy = async (value: string) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
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
      <View style={sharedStyles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ padding: 24 }}
    >
      <Text style={sharedStyles.title}>My Profile</Text>

      <Text style={styles.sectionLabel}>Role(s)</Text>
      <RoleChips selected={roles} onToggle={toggleRole} />

      <Text style={styles.sectionLabel}>In-game name (IGN)</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[sharedStyles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Your in-game name"
          value={inGameName}
          onChangeText={setInGameName}
        />
        <Pressable style={styles.copyBtn} onPress={() => copy(inGameName)}>
          <Text style={styles.copyBtnText}>Copy</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>UID</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[sharedStyles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Your in-game UID"
          value={inGameUid}
          onChangeText={setInGameUid}
        />
        <Pressable style={styles.copyBtn} onPress={() => copy(inGameUid)}>
          <Text style={styles.copyBtnText}>Copy</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Social links</Text>
      <TextInput
        style={sharedStyles.input}
        placeholder="WhatsApp URL"
        autoCapitalize="none"
        value={whatsappUrl}
        onChangeText={setWhatsappUrl}
      />
      <TextInput
        style={sharedStyles.input}
        placeholder="Instagram URL"
        autoCapitalize="none"
        value={instagramUrl}
        onChangeText={setInstagramUrl}
      />
      <TextInput
        style={sharedStyles.input}
        placeholder="Discord URL"
        autoCapitalize="none"
        value={discordUrl}
        onChangeText={setDiscordUrl}
      />
      <TextInput
        style={sharedStyles.input}
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
        <Text style={sharedStyles.buttonText}>
          {isSaving ? 'Saving…' : 'Save Profile'}
        </Text>
      </Pressable>

      <Text style={styles.sectionLabel}>My devices</Text>
      {profile.devices.map((device) => (
        <View key={device.id} style={styles.deviceRow}>
          <Text style={{ flex: 1 }}>
            {device.name} — {device.model}
          </Text>
          <Pressable onPress={() => onRemoveDevice(device.id)}>
            <Text style={{ color: '#dc2626' }}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.inputRow}>
        <TextInput
          style={[sharedStyles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Device name (e.g. Main rig)"
          value={deviceName}
          onChangeText={setDeviceName}
        />
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={[sharedStyles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Device model (e.g. ROG Phone 8)"
          value={deviceModel}
          onChangeText={setDeviceModel}
        />
      </View>
      <Pressable
        style={[
          sharedStyles.button,
          (!deviceName || !deviceModel || isAddingDevice) &&
            sharedStyles.buttonDisabled,
        ]}
        disabled={!deviceName || !deviceModel || isAddingDevice}
        onPress={onAddDevice}
      >
        <Text style={sharedStyles.buttonText}>Add Device</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: 20,
    marginBottom: 8,
    fontWeight: '600',
    color: '#333',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f1f1f1',
  },
  copyBtnText: { fontWeight: '600', color: '#111' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
