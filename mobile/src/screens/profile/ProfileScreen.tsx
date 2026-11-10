import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
import { useBookTabs } from '../../ui/BookTabs';
import { SegmentedTabs } from '../../ui/SegmentedTabs';
import { PhoneField } from '../../ui/PhoneField';
import { Toast, useToast } from '../../ui/Toast';
import { useSharedStyles, formatRoleBadge } from '../shared';
import { useAuth } from '../../auth/AuthContext';
import { coercePhoneToE164 } from '../../lib/phone';
import {
  SOCIAL_PLACEHOLDERS,
  validateAllSocialUrls,
} from '../../lib/socialUrls';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { resolveMediaUrl } from '../../api/client';
import { apiErrorMessage } from '../../api/apiErrorMessage';

type ProfileTab = 'user' | 'game' | 'devices' | 'social';

const PROFILE_TAB_IDS: ProfileTab[] = ['user', 'game', 'devices', 'social'];

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
  const shared = useSharedStyles();
  const { refreshUser } = useAuth();
  const styles = useThemedStyles(profileStyles);
  const { message: toastMessage, showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { tab, openTab } = useBookTabs(PROFILE_TAB_IDS, 'user');
  const profileTab = tab as ProfileTab;

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
    if (
      mustComplete &&
      isFormComplete(
        updated.inGameName ?? '',
        updated.inGameUid ?? '',
        updated.phone ?? '',
      )
    ) {
      await refreshUser();
    }
  };

  const userDone = !!profile?.phone?.trim();
  const gameDone = !!(
    profile?.inGameName?.trim() && profile?.inGameUid?.trim()
  );

  const tryOpenTab = (next: ProfileTab) => {
    if (!mustComplete) {
      openTab(next);
      return;
    }
    if (next === 'user') {
      openTab('user');
      return;
    }
    if (next === 'game') {
      if (!userDone) {
        showToast('Save your name and phone first.');
        openTab('user');
        return;
      }
      openTab('game');
      return;
    }
    // Devices / Social only after required User + Game are saved.
    if (!userDone || !gameDone) {
      showToast(
        !userDone
          ? 'Save your name and phone first.'
          : 'Save your in-game name and UID first.',
      );
      openTab(!userDone ? 'user' : 'game');
      return;
    }
    openTab(next);
  };

  if (isLoading || !profile) {
    return (
      <Screen>
        <View style={shared.container}>
          <ActivityIndicator color="#c9ccd1" />
        </View>
      </Screen>
    );
  }

  const roleBadge = formatRoleBadge(profile.role, profile.isOwner);
  const avatarUri = resolveMediaUrl(profile.avatarUrl);

  const onPickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow gallery access to set your photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      showToast('Uploading photo…');
      const updated = await usersApi.uploadMyAvatar({
        uri: asset.uri,
        fileName: asset.fileName ?? `avatar-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      await onProfileUpdated(updated);
      await refreshUser();
      showToast('Photo updated');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not upload photo'));
    }
  };

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={staticStyles.headerRow}>
          <SoftPressable
            onPress={() => void onPickAvatar()}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            pressScale={0.96}
            style={staticStyles.avatarBtn}
          >
            <View style={staticStyles.avatar}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={staticStyles.avatarImg}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarInitial}>
                  {(profile.name || '?').slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={styles.avatarHint}>Change photo</Text>
          </SoftPressable>
          <View style={staticStyles.headerText}>
            <Text style={styles.displayName} numberOfLines={2}>
              {profile.name}
            </Text>
            {roleBadge ? (
              <View style={staticStyles.rolePill}>
                <Text style={styles.roleBadge}>{roleBadge}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {mustComplete && (
          <Text style={styles.introText}>
            Just a few required details before you continue.
          </Text>
        )}

        <SegmentedTabs
          value={profileTab}
          onChange={tryOpenTab}
          tabs={
            [
              { value: 'user', label: 'User' },
              { value: 'game', label: 'Game' },
              { value: 'devices', label: 'Devices' },
              { value: 'social', label: 'Social' },
            ] as const
          }
        />

        <View style={staticStyles.panelCard}>
          {profileTab === 'user' ? (
            <UserProfileSection
              profile={profile}
              mustComplete={mustComplete}
              onUpdated={onProfileUpdated}
              onAdvance={() => openTab('game')}
              showToast={showToast}
            />
          ) : profileTab === 'game' ? (
            <GameProfileSection
              profile={profile}
              mustComplete={mustComplete}
              onUpdated={onProfileUpdated}
              onAdvance={() => openTab('devices')}
              showToast={showToast}
            />
          ) : profileTab === 'devices' ? (
            <DevicesProfileSection
              profile={profile}
              onDevicesChanged={load}
              mustComplete={mustComplete}
              onAdvance={() => openTab('social')}
              showToast={showToast}
            />
          ) : (
            <SocialProfileSection
              profile={profile}
              mustComplete={mustComplete}
              onUpdated={onProfileUpdated}
              onAdvance={async () => {
                await refreshUser();
              }}
              showToast={showToast}
            />
          )}
        </View>
      </ScrollView>
      <Toast message={toastMessage} />
    </Screen>
  );
}

function UserProfileSection({
  profile,
  mustComplete,
  onUpdated,
  onAdvance,
  showToast,
}: {
  profile: Profile;
  mustComplete: boolean;
  onUpdated: (updated: Profile) => void | Promise<void>;
  onAdvance?: () => void;
  showToast: (message: string) => void;
}) {
  const shared = useSharedStyles();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(profileStyles);
  const [isEditing, setIsEditing] = useState(mustComplete);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(profile.name);
  // Normalize once so prefilled bare digits still pass mustComplete canSave.
  const [phone, setPhone] = useState(
    () => coercePhoneToE164(profile.phone) || profile.phone || '',
  );

  const phoneE164 = coercePhoneToE164(phone);
  const canSave =
    name.trim().length > 0 && (!mustComplete || phoneE164.length > 0);

  const onSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        name: name.trim(),
        phone: phoneE164 || undefined,
      });
      await onUpdated(updated);
      if (mustComplete) {
        onAdvance?.();
      } else {
        setIsEditing(false);
        showToast('Saved — your profile was updated.');
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message?.toString() ?? 'Could not save. Please try again.',
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
      <Text style={staticStyles.sectionLabel}>Name *</Text>
      <CopyableInput placeholder="Your name" value={name} onChangeText={setName} />

      {user?.email && (
        <>
          <Text style={staticStyles.sectionLabel}>Email</Text>
          <CopyableField label="Signed up with" value={user.email} />
        </>
      )}

      <Text style={staticStyles.sectionLabel}>Phone {mustComplete ? '*' : ''}</Text>
      <PhoneField value={phone} onChange={setPhone} />
      {mustComplete && <Text style={styles.requiredHint}>* Required</Text>}

      <SoftPressable
        style={[
          shared.button,
          (isSaving || !canSave) && shared.buttonDisabled,
        ]}
        disabled={isSaving || !canSave}
        onPress={onSave}
        pressScale={0.98}
      >
        <ButtonLabel icon={mustComplete ? 'arrow-forward' : 'save'}>
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
  onAdvance,
  showToast,
}: {
  profile: Profile;
  mustComplete: boolean;
  onUpdated: (updated: Profile) => void | Promise<void>;
  onAdvance?: () => void;
  showToast: (message: string) => void;
}) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(profileStyles);
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
      await onUpdated(updated);
      if (mustComplete) {
        // Required fields done — optional Devices next (web parity).
        onAdvance?.();
      } else {
        setIsEditing(false);
        showToast('Saved — your profile was updated.');
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message?.toString() ?? 'Could not save. Please try again.',
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
      <Text style={staticStyles.sectionLabel}>Role(s)</Text>
      <RoleChips selected={roles} onToggle={toggleRole} />

      <Text style={staticStyles.sectionLabel}>In-Game Name (IGN) {mustComplete ? '*' : ''}</Text>
      <CopyableInput
        placeholder="Your in-game name"
        value={inGameName}
        onChangeText={setInGameName}
      />

      <Text style={staticStyles.sectionLabel}>UID {mustComplete ? '*' : ''}</Text>
      <CopyableInput
        placeholder="Your in-game UID"
        value={inGameUid}
        onChangeText={setInGameUid}
      />
      {mustComplete && <Text style={styles.requiredHint}>* Required</Text>}

      <SoftPressable
        style={[
          shared.button,
          (isSaving || !canSave) && shared.buttonDisabled,
        ]}
        disabled={isSaving || !canSave}
        onPress={onSave}
        pressScale={0.98}
      >
        <ButtonLabel icon={mustComplete ? 'arrow-forward' : 'save'}>
          {isSaving ? 'Saving…' : mustComplete ? 'Continue' : 'Save'}
        </ButtonLabel>
      </SoftPressable>
    </View>
  );
}

function DevicesProfileSection({
  profile,
  onDevicesChanged,
  mustComplete = false,
  onAdvance,
  showToast,
}: {
  profile: Profile;
  onDevicesChanged: () => Promise<void>;
  mustComplete?: boolean;
  onAdvance?: () => void;
  showToast: (message: string) => void;
}) {
  const shared = useSharedStyles();
  const styles = useThemedStyles(profileStyles);
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
      showToast(
        err?.response?.data?.message?.toString() ?? 'Could not add device. Please try again.',
      );
    } finally {
      setIsAddingDevice(false);
    }
  };

  const onRemoveDevice = async (id: string) => {
    try {
      await usersApi.removeDevice(id);
      await onDevicesChanged();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message?.toString() ?? 'Could not remove device. Please try again.',
      );
    }
  };

  return (
    <View>
      <Text style={staticStyles.sectionLabel}>My Devices</Text>
      {profile.devices.length === 0 ? (
        <Text style={styles.emptyHint}>No devices yet — add your first below.</Text>
      ) : (
        profile.devices.map((device) => (
          <View key={device.id} style={styles.deviceRow}>
            <Text style={styles.deviceText}>
              {device.name} — {device.model}
            </Text>
            <CopyButton value={`${device.name} — ${device.model}`} />
            <SoftPressable
              onPress={() => onRemoveDevice(device.id)}
              hitSlop={8}
              pressScale={0.95}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${device.name}`}
            >
              <Text style={styles.removeText}>Remove</Text>
            </SoftPressable>
          </View>
        ))
      )}

      <Text style={staticStyles.sectionLabel}>Add device</Text>
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
          shared.button,
          (!deviceName || !deviceModel || isAddingDevice) &&
            shared.buttonDisabled,
        ]}
        disabled={!deviceName || !deviceModel || isAddingDevice}
        onPress={onAddDevice}
        pressScale={0.98}
      >
        <ButtonLabel icon="phone">
          {isAddingDevice ? 'Adding…' : 'Add Device'}
        </ButtonLabel>
      </SoftPressable>
      {mustComplete ? (
        <SoftPressable
          style={[shared.button, { marginTop: 12 }]}
          onPress={() => onAdvance?.()}
          pressScale={0.98}
        >
          <ButtonLabel icon="arrow-forward">Continue</ButtonLabel>
        </SoftPressable>
      ) : null}
    </View>
  );
}

function SocialProfileSection({
  profile,
  mustComplete = false,
  onUpdated,
  onAdvance,
  showToast,
}: {
  profile: Profile;
  mustComplete?: boolean;
  onUpdated: (updated: Profile) => void | Promise<void>;
  onAdvance?: () => void | Promise<void>;
  showToast: (message: string) => void;
}) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(profileStyles);
  const [isEditing, setIsEditing] = useState(mustComplete);
  const [isSaving, setIsSaving] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState(profile.whatsappUrl ?? '');
  const [instagramUrl, setInstagramUrl] = useState(profile.instagramUrl ?? '');
  const [discordUrl, setDiscordUrl] = useState(profile.discordUrl ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(profile.youtubeUrl ?? '');

  const onSave = async () => {
    const invalid = validateAllSocialUrls({
      whatsapp: whatsappUrl,
      instagram: instagramUrl,
      discord: discordUrl,
      youtube: youtubeUrl,
    });
    if (invalid) {
      showToast(invalid);
      return;
    }
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        whatsappUrl: whatsappUrl.trim() || undefined,
        instagramUrl: instagramUrl.trim() || undefined,
        discordUrl: discordUrl.trim() || undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
      });
      await onUpdated(updated);
      if (mustComplete) {
        await onAdvance?.();
      } else {
        setIsEditing(false);
        showToast('Saved — your profile was updated.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      showToast(
        Array.isArray(msg)
          ? msg.join(', ')
          : msg?.toString() ?? 'Could not save. Please try again.',
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
        {mustComplete ? (
          <SoftPressable
            style={[shared.button, { marginTop: 12 }]}
            onPress={() => void onAdvance?.()}
            pressScale={0.98}
          >
            <ButtonLabel icon="arrow-forward">Continue</ButtonLabel>
          </SoftPressable>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={staticStyles.sectionLabel}>WhatsApp</Text>
      <CopyableInput
        placeholder={SOCIAL_PLACEHOLDERS.whatsapp}
        autoCapitalize="none"
        value={whatsappUrl}
        onChangeText={setWhatsappUrl}
      />
      <Text style={staticStyles.sectionLabel}>Instagram</Text>
      <CopyableInput
        placeholder={SOCIAL_PLACEHOLDERS.instagram}
        autoCapitalize="none"
        value={instagramUrl}
        onChangeText={setInstagramUrl}
      />
      <Text style={staticStyles.sectionLabel}>Discord</Text>
      <CopyableInput
        placeholder={SOCIAL_PLACEHOLDERS.discord}
        autoCapitalize="none"
        value={discordUrl}
        onChangeText={setDiscordUrl}
      />
      <Text style={staticStyles.sectionLabel}>YouTube</Text>
      <CopyableInput
        placeholder={SOCIAL_PLACEHOLDERS.youtube}
        autoCapitalize="none"
        value={youtubeUrl}
        onChangeText={setYoutubeUrl}
      />

      <SoftPressable
        style={[shared.button, isSaving && shared.buttonDisabled]}
        disabled={isSaving}
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

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 8,
  },
  avatarBtn: {
    alignItems: 'center',
    width: 84,
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarImg: { width: '100%', height: '100%' },
  rolePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(168,176,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(168,176,255,0.28)',
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
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function profileStyles(c: ThemeColors) {
  return {
    displayName: {
      color: c.text,
      fontSize: 22,
      fontWeight: '700' as const,
      letterSpacing: -0.3,
    },
    avatarInitial: {
      color: c.text,
      fontSize: 28,
      fontWeight: '700' as const,
    },
    avatarHint: {
      color: c.link,
      fontSize: 11,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
    },
    roleBadge: {
      color: c.link,
      fontWeight: '700' as const,
      fontSize: 12,
    },
    deviceRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    deviceText: {
      flex: 1,
      color: c.text,
      fontSize: 15,
    },
    removeText: {
      color: c.danger,
      fontWeight: '600' as const,
    },
    emptyHint: {
      color: c.textMuted,
      marginBottom: 8,
      fontSize: 13,
    },
    introText: {
      color: c.textMuted,
      marginBottom: 8,
      textAlign: 'center' as const,
    },
    requiredHint: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: -8,
      marginBottom: 4,
    },
    editButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.link,
      backgroundColor: 'rgba(168,176,255,0.12)',
      paddingVertical: 12,
      marginTop: 20,
    },
  };
}
