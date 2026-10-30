import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { ROLE_OPTIONS, RoleOption } from '../../api/roles';
import { RoleChips } from './RoleChips';
import { CopyableInput } from './CopyableInput';
import { CopyableField } from './CopyableField';
import { CopyButton } from './CopyButton';
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { SoftPressable } from '../../ui/SoftPressable';
import { FadeSwap } from '../../ui/FadeSwap';
import { SegmentedTabs } from '../../ui/SegmentedTabs';
import { sharedStyles, formatRoleBadge } from '../shared';
import { useAuth } from '../../auth/AuthContext';
import { colors } from '../../theme';

type ProfileTab = 'user' | 'game' | 'devices' | 'social';

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

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={
            [
              { value: 'user', label: 'User' },
              { value: 'game', label: 'Game' },
              { value: 'devices', label: 'Devices' },
              { value: 'social', label: 'Social' },
            ] as const
          }
        />

        <FadeSwap contentKey={tab} style={styles.panelCard}>
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
            />
          )}
          {tab === 'devices' && (
            <DevicesProfileSection
              profile={profile}
              onDevicesChanged={load}
            />
          )}
          {tab === 'social' && (
            <SocialProfileSection profile={profile} onUpdated={onProfileUpdated} />
          )}
        </FadeSwap>
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
        <SoftPressable
          style={styles.editButton}
          onPress={() => setIsEditing(true)}
          pressScale={0.97}
        >
          <ButtonLabel icon="edit" color={colors.link}>
            Edit
          </ButtonLabel>
        </SoftPressable>
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

      <SoftPressable
        style={[
          sharedStyles.button,
          (isSaving || !canSave) && sharedStyles.buttonDisabled,
        ]}
        disabled={isSaving || !canSave}
        onPress={onSave}
        pressScale={0.98}
      >
        <ButtonLabel icon="save">
          {isSaving ? 'Saving…' : mustComplete ? 'Continue' : 'Save'}
        </ButtonLabel>
      </SoftPressable>
    </View>
  );
}

function knownRolesOnly(roles: string[]): string[] {
  const allowed = new Set<string>(ROLE_OPTIONS);
  return roles.filter((r) => allowed.has(r));
}

function GameProfileSection({
  profile,
  mustComplete,
  onUpdated,
}: {
  profile: Profile;
  mustComplete: boolean;
  onUpdated: (updated: Profile) => void;
}) {
  const [isEditing, setIsEditing] = useState(mustComplete);
  const [isSaving, setIsSaving] = useState(false);
  const [roles, setRoles] = useState<string[]>(() => knownRolesOnly(profile.roles));
  const [inGameName, setInGameName] = useState(profile.inGameName ?? '');
  const [inGameUid, setInGameUid] = useState(profile.inGameUid ?? '');

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
        roles: knownRolesOnly(roles),
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

  if (!isEditing) {
    return (
      <View>
        {knownRolesOnly(profile.roles).length > 0 ? (
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

        <SoftPressable
          style={styles.editButton}
          onPress={() => setIsEditing(true)}
          pressScale={0.97}
        >
          <ButtonLabel icon="edit" color={colors.link}>
            Edit
          </ButtonLabel>
        </SoftPressable>
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

      <SoftPressable
        style={[
          sharedStyles.button,
          (isSaving || !canSave) && sharedStyles.buttonDisabled,
        ]}
        disabled={isSaving || !canSave}
        onPress={onSave}
        pressScale={0.98}
      >
        <ButtonLabel icon="save">
          {isSaving ? 'Saving…' : mustComplete ? 'Continue' : 'Save'}
        </ButtonLabel>
      </SoftPressable>
    </View>
  );
}

function DevicesProfileSection({
  profile,
  onDevicesChanged,
}: {
  profile: Profile;
  onDevicesChanged: () => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [isAddingDevice, setIsAddingDevice] = useState(false);

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
        <Text style={styles.sectionLabel}>My Devices</Text>
        {profile.devices.length === 0 ? (
          <Text style={{ color: '#9aa0a6', marginBottom: 12 }}>No devices yet.</Text>
        ) : (
          profile.devices.map((device) => (
            <View key={device.id} style={styles.deviceRow}>
              <Text style={{ flex: 1, color: '#f2f3f5' }}>
                {device.name} — {device.model}
              </Text>
              <CopyButton value={`${device.name} — ${device.model}`} />
            </View>
          ))
        )}
        <SoftPressable
          style={styles.editButton}
          onPress={() => setIsEditing(true)}
          pressScale={0.97}
        >
          <ButtonLabel icon="edit" color={colors.link}>
            Edit
          </ButtonLabel>
        </SoftPressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>My Devices</Text>
      {profile.devices.length === 0 ? (
        <Text style={{ color: '#9aa0a6', marginBottom: 12 }}>No devices yet.</Text>
      ) : (
        profile.devices.map((device) => (
          <View key={device.id} style={styles.deviceRow}>
            <Text style={{ flex: 1, color: '#f2f3f5' }}>
              {device.name} — {device.model}
            </Text>
            <CopyButton value={`${device.name} — ${device.model}`} />
            <SoftPressable
              onPress={() => onRemoveDevice(device.id)}
              hitSlop={8}
              pressScale={0.95}
            >
              <Text style={{ color: '#f87171' }}>Remove</Text>
            </SoftPressable>
          </View>
        ))
      )}
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
      <SoftPressable
        style={[
          sharedStyles.button,
          (!deviceName || !deviceModel || isAddingDevice) &&
            sharedStyles.buttonDisabled,
        ]}
        disabled={!deviceName || !deviceModel || isAddingDevice}
        onPress={onAddDevice}
        pressScale={0.98}
      >
        <ButtonLabel icon="phone">Add Device</ButtonLabel>
      </SoftPressable>
      <SoftPressable
        style={styles.editButton}
        onPress={() => {
          setDeviceName('');
          setDeviceModel('');
          setIsEditing(false);
        }}
        pressScale={0.97}
      >
        <ButtonLabel icon="edit" color={colors.link}>
          Done
        </ButtonLabel>
      </SoftPressable>
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
        <CopyableField label="WhatsApp" value={profile.whatsappUrl ?? ''} />
        <CopyableField label="Instagram" value={profile.instagramUrl ?? ''} />
        <CopyableField label="Discord" value={profile.discordUrl ?? ''} />
        <CopyableField label="YouTube" value={profile.youtubeUrl ?? ''} />

        <SoftPressable
          style={styles.editButton}
          onPress={() => setIsEditing(true)}
          pressScale={0.97}
        >
          <ButtonLabel icon="edit" color={colors.link}>
            Edit
          </ButtonLabel>
        </SoftPressable>
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

      <SoftPressable
        style={[sharedStyles.button, isSaving && sharedStyles.buttonDisabled]}
        disabled={isSaving}
        onPress={onSave}
        pressScale={0.98}
      >
        <ButtonLabel icon="save">{isSaving ? 'Saving…' : 'Save'}</ButtonLabel>
      </SoftPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  roleBadge: {
    color: colors.link,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -16,
    marginBottom: 16,
  },
  panelCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionLabel: {
    marginTop: 16,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  introText: {
    color: colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  requiredHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.link,
    backgroundColor: 'rgba(168,176,255,0.12)',
    paddingVertical: 12,
    marginTop: 20,
  },
});
