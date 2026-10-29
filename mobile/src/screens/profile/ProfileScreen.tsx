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

type ProfileTab = 'user' | 'game' | 'social';

// IGN, UID and phone are compulsory for every user — everything else
// (socials) stays optional. Enforced here for both the one-time forced
// post-login gate (mustComplete) and the regular "Edit My Profile" screen,
// so the invariant can't be broken again by a later edit. Phone lives on the
// User Profile tab, IGN/UID on the Game Profile tab — isProfileComplete
// doesn't care which tab a field is edited from.
function isFormComplete(inGameName: string, inGameUid: string, phone: string) {
  return !!(inGameName.trim() && inGameUid.trim() && phone.trim());
}

export function ProfileScreen({ mustComplete = false }: { mustComplete?: boolean } = {}) {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<ProfileTab>('user');

  const load = useCallback(async () => {
    const data = await usersApi.getMyProfile();
    setProfile(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onProfileUpdated = async (updated: Profile) => {
    setProfile(updated);
    if (mustComplete && isFormComplete(updated.inGameName ?? '', updated.inGameUid ?? '', updated.phone ?? '')) {
      await refreshUser();
    }
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

  const roleBadge = formatRoleBadge(profile.role, profile.isOwner);

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={sharedStyles.title}>{profile.name}</Text>
        {roleBadge && <Text style={styles.roleBadge}>{roleBadge}</Text>}

        {mustComplete && (
          <Text style={styles.introText}>
            Just a few required details before you continue.
          </Text>
        )}

        <View style={styles.tabRow}>
          {(
            [
              ['user', 'User Profile'],
              ['game', 'Game Profile'],
              ['social', 'Social Profile'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              style={[styles.tab, tab === value && styles.tabActive]}
              onPress={() => setTab(value)}
            >
              <Text style={tab === value ? styles.tabTextActive : styles.tabText}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'user' && (
          <UserProfileSection
            profile={profile}
            mustComplete={mustComplete}
            onUpdated={onProfileUpdated}
          />
        )}
        {tab === 'game' && (
          <GameProfileSection
            profile={profile}
            mustComplete={mustComplete}
            onUpdated={onProfileUpdated}
            onDevicesChanged={load}
          />
        )}
        {tab === 'social' && (
          <SocialProfileSection profile={profile} onUpdated={onProfileUpdated} />
        )}
      </ScrollView>
    </Screen>
  );
}

function UserProfileSection({
  profile,
  mustComplete,
  onUpdated,
}: {
  profile: Profile;
  mustComplete: boolean;
  onUpdated: (updated: Profile) => void;
}) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(mustComplete);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');

  const canSave = name.trim().length > 0 && (!mustComplete || phone.trim().length > 0);

  const onSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        name: name.trim(),
        phone: phone || undefined,
      });
      onUpdated(updated);
      if (!mustComplete) {
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

  if (!isEditing) {
    return (
      <View>
        <CopyableField label="Name" value={profile.name} />
        {user?.email && <CopyableField label="Email" value={user.email} />}
        {profile.phone && <CopyableField label="Phone" value={profile.phone} />}
        <Pressable
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
          onPress={() => setIsEditing(true)}
        >
          <ButtonLabel icon="edit" color={colors.link}>
            Edit
          </ButtonLabel>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>Name *</Text>
      <CopyableInput placeholder="Your name" value={name} onChangeText={setName} />

      {user?.email && (
        <>
          <Text style={styles.sectionLabel}>Email</Text>
          <CopyableField label="Signed up with" value={user.email} />
        </>
      )}

      <Text style={styles.sectionLabel}>Phone {mustComplete ? '*' : ''}</Text>
      <CopyableInput
        placeholder="Your phone number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {mustComplete && <Text style={styles.requiredHint}>* Required</Text>}

      <Pressable
        style={[sharedStyles.button, (isSaving || !canSave) && sharedStyles.buttonDisabled]}
        disabled={isSaving || !canSave}
        onPress={onSave}
      >
        <ButtonLabel icon="save">
          {isSaving ? 'Saving…' : mustComplete ? 'Continue' : 'Save'}
        </ButtonLabel>
      </Pressable>
    </View>
  );
}

function GameProfileSection({
  profile,
  mustComplete,
  onUpdated,
  onDevicesChanged,
}: {
  profile: Profile;
  mustComplete: boolean;
  onUpdated: (updated: Profile) => void;
  onDevicesChanged: () => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(mustComplete);
  const [isSaving, setIsSaving] = useState(false);
  const [roles, setRoles] = useState<string[]>(profile.roles);
  const [inGameName, setInGameName] = useState(profile.inGameName ?? '');
  const [inGameUid, setInGameUid] = useState(profile.inGameUid ?? '');

  const [deviceName, setDeviceName] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [isAddingDevice, setIsAddingDevice] = useState(false);

  const toggleRole = (role: RoleOption) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const canSave = !mustComplete || !!(inGameName.trim() && inGameUid.trim());

  const onSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        roles,
        inGameName: inGameName || undefined,
        inGameUid: inGameUid || undefined,
      });
      onUpdated(updated);
      if (!mustComplete) {
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
      await onDevicesChanged();
    } catch (err: any) {
      Alert.alert('Could not add device', err?.response?.data?.message ?? '');
    } finally {
      setIsAddingDevice(false);
    }
  };

  const onRemoveDevice = async (id: string) => {
    await usersApi.removeDevice(id);
    await onDevicesChanged();
  };

  if (!isEditing) {
    return (
      <View>
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

        <Pressable
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
          onPress={() => setIsEditing(true)}
        >
          <ButtonLabel icon="edit" color={colors.link}>
            Edit
          </ButtonLabel>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>Role(s)</Text>
      <RoleChips selected={roles} onToggle={toggleRole} />

      <Text style={styles.sectionLabel}>In-Game Name (IGN) {mustComplete ? '*' : ''}</Text>
      <CopyableInput
        placeholder="Your in-game name"
        value={inGameName}
        onChangeText={setInGameName}
      />

      <Text style={styles.sectionLabel}>UID {mustComplete ? '*' : ''}</Text>
      <CopyableInput
        placeholder="Your in-game UID"
        value={inGameUid}
        onChangeText={setInGameUid}
      />
      {mustComplete && <Text style={styles.requiredHint}>* Required</Text>}

      <Pressable
        style={[sharedStyles.button, (isSaving || !canSave) && sharedStyles.buttonDisabled]}
        disabled={isSaving || !canSave}
        onPress={onSave}
      >
        <ButtonLabel icon="save">
          {isSaving ? 'Saving…' : mustComplete ? 'Continue' : 'Save'}
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
              (!deviceName || !deviceModel || isAddingDevice) && sharedStyles.buttonDisabled,
            ]}
            disabled={!deviceName || !deviceModel || isAddingDevice}
            onPress={onAddDevice}
          >
            <ButtonLabel icon="phone">Add Device</ButtonLabel>
          </Pressable>
        </>
      )}
    </View>
  );
}

function SocialProfileSection({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (updated: Profile) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState(profile.whatsappUrl ?? '');
  const [instagramUrl, setInstagramUrl] = useState(profile.instagramUrl ?? '');
  const [discordUrl, setDiscordUrl] = useState(profile.discordUrl ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(profile.youtubeUrl ?? '');

  const onSave = async () => {
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        whatsappUrl: whatsappUrl || undefined,
        instagramUrl: instagramUrl || undefined,
        discordUrl: discordUrl || undefined,
        youtubeUrl: youtubeUrl || undefined,
      });
      onUpdated(updated);
      setIsEditing(false);
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

  if (!isEditing) {
    return (
      <View>
        {profile.whatsappUrl && <CopyableField label="WhatsApp" value={profile.whatsappUrl} />}
        {profile.instagramUrl && (
          <CopyableField label="Instagram" value={profile.instagramUrl} />
        )}
        {profile.discordUrl && <CopyableField label="Discord" value={profile.discordUrl} />}
        {profile.youtubeUrl && <CopyableField label="YouTube" value={profile.youtubeUrl} />}
        {!profile.whatsappUrl &&
          !profile.instagramUrl &&
          !profile.discordUrl &&
          !profile.youtubeUrl && (
            <Text style={{ color: '#9aa0a6' }}>No social links set yet</Text>
          )}

        <Pressable
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
          onPress={() => setIsEditing(true)}
        >
          <ButtonLabel icon="edit" color={colors.link}>
            Edit
          </ButtonLabel>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>WhatsApp</Text>
      <CopyableInput
        placeholder="WhatsApp URL"
        autoCapitalize="none"
        value={whatsappUrl}
        onChangeText={setWhatsappUrl}
      />
      <Text style={styles.sectionLabel}>Instagram</Text>
      <CopyableInput
        placeholder="Instagram URL"
        autoCapitalize="none"
        value={instagramUrl}
        onChangeText={setInstagramUrl}
      />
      <Text style={styles.sectionLabel}>Discord</Text>
      <CopyableInput
        placeholder="Discord URL"
        autoCapitalize="none"
        value={discordUrl}
        onChangeText={setDiscordUrl}
      />
      <Text style={styles.sectionLabel}>YouTube</Text>
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
        <ButtonLabel icon="save">{isSaving ? 'Saving…' : 'Save'}</ButtonLabel>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  roleBadge: {
    color: '#a8b0ff',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -16,
    marginBottom: 16,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.chrome, borderColor: colors.chrome },
  tabText: { color: colors.text, fontWeight: '600' },
  tabTextActive: { color: colors.chromeInk, fontWeight: '600' },
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
    marginTop: 20,
  },
  editButtonPressed: {
    backgroundColor: 'rgba(168,176,255,0.26)',
    transform: [{ scale: 0.98 }],
  },
});
