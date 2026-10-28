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
import { CopyableField } from './CopyableField';
import { CopyButton } from './CopyButton';
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { sharedStyles, formatRoleBadge } from '../shared';
import { useAuth } from '../../auth/AuthContext';
import { colors } from '../../theme';

// IGN, UID and phone are compulsory for every user — everything else
// (socials) stays optional. Enforced here for both the one-time forced
// post-login gate (mustComplete) and the regular "Edit My Profile" screen,
// so the invariant can't be broken again by a later edit.
function isFormComplete(inGameName: string, inGameUid: string, phone: string) {
  return !!(inGameName.trim() && inGameUid.trim() && phone.trim());
}

export function ProfileScreen({ mustComplete = false }: { mustComplete?: boolean } = {}) {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // The forced post-login gate always starts (and stays) in edit mode —
  // there's nothing to view yet. The normal "Edit My Profile" entry shows a
  // read-only view first, with an Edit button to reach this same form.
  const [isEditing, setIsEditing] = useState(mustComplete);

  const [roles, setRoles] = useState<string[]>([]);
  const [inGameName, setInGameName] = useState('');
  const [inGameUid, setInGameUid] = useState('');
  const [phone, setPhone] = useState('');
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
    setPhone(data.phone ?? '');
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

  const formComplete = isFormComplete(inGameName, inGameUid, phone);

  const onSave = async () => {
    if (!formComplete) return;
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        roles,
        inGameName: inGameName || undefined,
        inGameUid: inGameUid || undefined,
        phone: phone || undefined,
        whatsappUrl: whatsappUrl || undefined,
        instagramUrl: instagramUrl || undefined,
        discordUrl: discordUrl || undefined,
        youtubeUrl: youtubeUrl || undefined,
      });
      setProfile(updated);
      if (mustComplete) {
        await refreshUser();
      } else {
        setIsEditing(false);
        Alert.alert('Saved', 'Your profile was updated.');
      }
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

  if (!isEditing) {
    const roleBadge = formatRoleBadge(profile.role, profile.isOwner);
    return (
      <Screen>
        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ padding: 24 }}
        >
          <Text style={sharedStyles.title}>{profile.name}</Text>
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

          <Pressable
            style={({ pressed }) => [
              styles.editButton,
              pressed && styles.editButtonPressed,
            ]}
            onPress={() => setIsEditing(true)}
          >
            <ButtonLabel icon="edit" color={colors.link}>
              Edit
            </ButtonLabel>
          </Pressable>

          {profile.roles.length > 0 ? (
            <RoleChips selected={profile.roles} editable={false} />
          ) : (
            <Text style={{ color: '#9aa0a6', marginTop: 12, marginBottom: 12 }}>
              No role set yet
            </Text>
          )}

          {profile.inGameName && (
            <CopyableField label="In-Game Name (IGN)" value={profile.inGameName} />
          )}
          {profile.inGameUid && <CopyableField label="UID" value={profile.inGameUid} />}
          {profile.phone && <CopyableField label="Phone" value={profile.phone} />}

          <Text style={styles.sectionLabel}>Social Links</Text>
          {profile.whatsappUrl && (
            <CopyableField label="WhatsApp" value={profile.whatsappUrl} />
          )}
          {profile.instagramUrl && (
            <CopyableField label="Instagram" value={profile.instagramUrl} />
          )}
          {profile.discordUrl && (
            <CopyableField label="Discord" value={profile.discordUrl} />
          )}
          {profile.youtubeUrl && (
            <CopyableField label="YouTube" value={profile.youtubeUrl} />
          )}
          {!profile.whatsappUrl &&
            !profile.instagramUrl &&
            !profile.discordUrl &&
            !profile.youtubeUrl && (
              <Text style={{ color: '#9aa0a6' }}>No social links set yet</Text>
            )}

          {profile.devices.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>My Devices</Text>
              {profile.devices.map((device) => (
                <View key={device.id} style={styles.deviceRow}>
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

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {mustComplete && (
          <Text style={styles.introText}>
            Just a few required details before you continue.
          </Text>
        )}

        <Text style={styles.sectionLabel}>Role(s)</Text>
        <RoleChips selected={roles} onToggle={toggleRole} />

        <Text style={styles.sectionLabel}>In-Game Name (IGN) *</Text>
        <CopyableInput
          placeholder="Your in-game name"
          value={inGameName}
          onChangeText={setInGameName}
        />

        <Text style={styles.sectionLabel}>UID *</Text>
        <CopyableInput
          placeholder="Your in-game UID"
          value={inGameUid}
          onChangeText={setInGameUid}
        />

        <Text style={styles.sectionLabel}>Phone *</Text>
        <CopyableInput
          placeholder="Your phone number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Text style={styles.requiredHint}>* Required</Text>

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
          style={[
            sharedStyles.button,
            (isSaving || !formComplete) && sharedStyles.buttonDisabled,
          ]}
          disabled={isSaving || !formComplete}
          onPress={onSave}
        >
          <ButtonLabel icon="save">
            {isSaving ? 'Saving…' : mustComplete ? 'Continue' : 'Save Profile'}
          </ButtonLabel>
        </Pressable>

        {!mustComplete && (
          <>
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
          </>
        )}
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
  introText: {
    color: '#9aa0a6',
    marginBottom: 8,
    textAlign: 'center',
  },
  requiredHint: {
    color: '#9aa0a6',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 4,
  },
  // Outlined + tinted in the app's own highlight color (the same periwinkle
  // used for the role badge above it) instead of the plain grey chrome
  // button shared by every other action — Edit reads as a distinct, lighter
  // action from a hard commit like Save. `pressed` gives instant tactile
  // feedback without an Animated timer (see Toast.tsx for why timers are
  // avoided here: they outlive unmounts in tests).
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.link,
    backgroundColor: 'rgba(168,176,255,0.12)',
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  editButtonPressed: {
    backgroundColor: 'rgba(168,176,255,0.26)',
    transform: [{ scale: 0.98 }],
  },
});
