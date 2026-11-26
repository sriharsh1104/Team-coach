import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as usersApi from '../../api/users';
import { GameProfile, Profile } from '../../api/types';
import {
  GAME_OPTIONS,
  GAME_ROLE_OPTIONS,
  GameId,
  gameLabel,
  gameRoleLabel,
  sanitizeGameUid,
} from '../../api/profileGames';
import { RoleChips } from './RoleChips';
import { TelegramPhoneVerify } from './TelegramPhoneVerify';
import { CopyableInput } from './CopyableInput';
import { CopyableField } from './CopyableField';
import { CopyButton } from './CopyButton';
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { SoftPressable } from '../../ui/SoftPressable';
import { SkeletonList } from '../../ui/Skeleton';
import { usePullToRefresh } from '../../ui/usePullToRefresh';
import { IconActionButton } from '../../ui/IconActionButton';
import { useBookTabs } from '../../ui/BookTabs';
import { SegmentedTabs } from '../../ui/SegmentedTabs';
import { Toast, useToast } from '../../ui/Toast';
import { useSharedStyles, formatRoleBadge } from '../shared';
import { useAuth } from '../../auth/AuthContext';
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

// IGN and UID are compulsory for every user — everything else (phone,
// socials) stays optional. The phone is verified later from the User tab via
// Telegram and never blocks the post-login gate. Mirrors the backend's
// isProfileComplete.
function isFormComplete(inGameName: string, inGameUid: string) {
  return !!(inGameName.trim() && inGameUid.trim());
}

export function ProfileScreen({
  mustComplete = false,
  route,
}: {
  mustComplete?: boolean;
  /** Passed by the stack navigator; Settings → Edit sets `edit: true`. */
  route?: { params?: { edit?: boolean } };
} = {}) {
  const shared = useSharedStyles();
  const { refreshUser } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(profileStyles);
  const { message: toastMessage, showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { tab, openTab } = useBookTabs(PROFILE_TAB_IDS, 'user');
  const profileTab = tab as ProfileTab;
  // Settings hub Edit should land in the form, not a second Edit tap.
  const startEditing = mustComplete || !!route?.params?.edit;

  const load = useCallback(async () => {
    const data = await usersApi.getMyProfile();
    setProfile(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshControl = usePullToRefresh(load);

  const onProfileUpdated = async (updated: Profile) => {
    setProfile(updated);
    if (
      mustComplete &&
      isFormComplete(updated.inGameName ?? '', updated.inGameUid ?? '')
    ) {
      await refreshUser();
    }
  };

  const userDone = !!profile?.name?.trim();
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
        showToast('Save your name first.');
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
          ? 'Save your name first.'
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
        <View style={[shared.container, { justifyContent: 'flex-start', paddingTop: 24 }]}>
          <SkeletonList count={6} avatarSize={64} />
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
        refreshControl={refreshControl}
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
              startEditing={startEditing}
              onUpdated={onProfileUpdated}
              onAdvance={() => openTab('game')}
              showToast={showToast}
            />
          ) : profileTab === 'game' ? (
            <GameProfileSection
              profile={profile}
              mustComplete={mustComplete}
              startEditing={startEditing}
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
              startEditing={startEditing}
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
  startEditing,
  onUpdated,
  onAdvance,
  showToast,
}: {
  profile: Profile;
  mustComplete: boolean;
  startEditing: boolean;
  onUpdated: (updated: Profile) => void | Promise<void>;
  onAdvance?: () => void;
  showToast: (message: string) => void;
}) {
  const shared = useSharedStyles();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(profileStyles);
  const [isEditing, setIsEditing] = useState(startEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(profile.name);
  // The phone is not part of this form: it is optional and set only through
  // Telegram verification (TelegramPhoneVerify), so saving never sends a number.
  const canSave = name.trim().length > 0;

  const onSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const updated = await usersApi.updateMyProfile({
        name: name.trim(),
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
        {profile.phone && (
          <CopyableField
            label={profile.phoneVerifiedAt ? 'Phone (verified)' : 'Phone (not verified)'}
            value={profile.phone}
          />
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
      <Text style={staticStyles.sectionLabel}>Name *</Text>
      <CopyableInput placeholder="Your name" value={name} onChangeText={setName} />

      {user?.email && (
        <>
          <Text style={staticStyles.sectionLabel}>Email</Text>
          <CopyableField label="Signed up with" value={user.email} />
        </>
      )}

      <Text style={staticStyles.sectionLabel}>Phone (optional)</Text>
      <TelegramPhoneVerify
        profile={profile}
        onVerified={onUpdated}
        showToast={showToast}
      />

      <SoftPressable
        style={[
          shared.button,
          staticStyles.saveButton,
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

function profileForGame(
  profile: Profile,
  game: GameId,
): { inGameName: string; inGameUid: string; role: string | null } {
  const row = (profile.gameProfiles ?? []).find((g) => g.game === game);
  if (row) {
    return {
      inGameName: row.inGameName ?? '',
      inGameUid: row.inGameUid ?? '',
      role: row.role,
    };
  }
  // Legacy Free Fire columns still win when the game-profiles list is empty
  // (pre-migration clients / incomplete backfill).
  if (game === 'FREE_FIRE') {
    return {
      inGameName: profile.inGameName ?? '',
      inGameUid: profile.inGameUid ?? '',
      role: profile.roles[0] ?? null,
    };
  }
  return { inGameName: '', inGameUid: '', role: null };
}

function filledGameProfiles(profile: Profile): GameProfile[] {
  const fromApi = profile.gameProfiles ?? [];
  if (fromApi.length > 0) return fromApi;
  if (profile.inGameName || profile.inGameUid || profile.roles[0]) {
    return [
      {
        game: 'FREE_FIRE',
        inGameName: profile.inGameName,
        inGameUid: profile.inGameUid,
        role: profile.roles[0] ?? null,
      },
    ];
  }
  return [];
}

function GameProfileSection({
  profile,
  mustComplete,
  startEditing,
  onUpdated,
  onAdvance,
  showToast,
}: {
  profile: Profile;
  mustComplete: boolean;
  startEditing: boolean;
  onUpdated: (updated: Profile) => void | Promise<void>;
  onAdvance?: () => void;
  showToast: (message: string) => void;
}) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(profileStyles);
  const [isEditing, setIsEditing] = useState(startEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [game, setGame] = useState<GameId>('FREE_FIRE');
  const initial = profileForGame(profile, 'FREE_FIRE');
  const [role, setRole] = useState<string | null>(initial.role);
  const [inGameName, setInGameName] = useState(initial.inGameName);
  const [inGameUid, setInGameUid] = useState(initial.inGameUid);

  const loadGame = (next: GameId) => {
    const data = profileForGame(profile, next);
    setGame(next);
    setRole(data.role);
    setInGameName(data.inGameName);
    setInGameUid(data.inGameUid);
  };

  const toggleRole = (next: string) => {
    setRole((prev) => (prev === next ? null : next));
  };

  const ffRequired = mustComplete && game === 'FREE_FIRE';
  const canSave = !ffRequired || !!(inGameName.trim() && inGameUid.trim());
  const roleOptions = GAME_ROLE_OPTIONS[game];
  const saved = filledGameProfiles(profile);

  const onSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const updated = await usersApi.upsertGameProfile({
        game,
        inGameName: inGameName.trim() || null,
        inGameUid: inGameUid.trim() || null,
        role,
      });
      await onUpdated(updated);
      if (mustComplete && game === 'FREE_FIRE') {
        onAdvance?.();
      } else {
        setIsEditing(false);
        showToast('Saved — your game profile was updated.');
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message?.toString() ??
          'Could not save. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const onClearOptional = async () => {
    if (game === 'FREE_FIRE') return;
    setIsSaving(true);
    try {
      const updated = await usersApi.removeGameProfile(game);
      await onUpdated(updated);
      setRole(null);
      setInGameName('');
      setInGameUid('');
      setIsEditing(false);
      showToast(`${gameLabel(game)} cleared`);
    } catch (err: any) {
      showToast(
        err?.response?.data?.message?.toString() ??
          'Could not clear. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <View>
        {saved.length === 0 ? (
          <Text style={{ color: colors.textMuted, marginTop: 12, marginBottom: 12 }}>
            No games set yet
          </Text>
        ) : (
          saved.map((row) => (
            <View key={row.game} style={styles.gameBlock}>
              <Text style={styles.gameTitle}>{gameLabel(row.game)}</Text>
              {row.role ? (
                <Text style={styles.gameMeta}>{gameRoleLabel(row.role)}</Text>
              ) : null}
              {row.inGameName ? (
                <CopyableField label="In-Game Name (IGN)" value={row.inGameName} />
              ) : null}
              {row.inGameUid ? (
                <CopyableField
                  label={row.game === 'LOL' ? 'Riot ID / UID' : 'UID'}
                  value={row.inGameUid}
                />
              ) : null}
            </View>
          ))
        )}

        <SoftPressable
          style={styles.editButton}
          onPress={() => {
            loadGame('FREE_FIRE');
            setIsEditing(true);
          }}
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
      <Text style={staticStyles.sectionLabel}>Game</Text>
      <View style={staticStyles.gamePicker}>
        {GAME_OPTIONS.map((opt) => {
          const active = game === opt.id;
          return (
            <SoftPressable
              key={opt.id}
              style={[styles.gameChip, active && styles.gameChipActive]}
              onPress={() => loadGame(opt.id)}
              pressScale={0.96}
            >
              <Text style={active ? styles.gameChipTextActive : styles.gameChipText}>
                {opt.label}
              </Text>
            </SoftPressable>
          );
        })}
      </View>
      {game !== 'FREE_FIRE' ? (
        <Text style={styles.optionalHint}>Optional — add only if you play this title.</Text>
      ) : mustComplete ? (
        <Text style={styles.optionalHint}>
          Free Fire IGN and UID are required to continue.
        </Text>
      ) : null}

      <Text style={staticStyles.sectionLabel}>Role</Text>
      <RoleChips
        selected={role ? [role] : []}
        onToggle={toggleRole}
        options={roleOptions}
      />

      <Text style={staticStyles.sectionLabel}>
        In-Game Name (IGN) {ffRequired ? '*' : ''}
      </Text>
      <CopyableInput
        placeholder={
          game === 'LOL' ? 'Summoner name' : 'Your in-game name'
        }
        value={inGameName}
        onChangeText={setInGameName}
      />

      <Text style={staticStyles.sectionLabel}>
        {game === 'LOL' ? 'Riot ID / UID' : 'UID'} {ffRequired ? '*' : ''}
      </Text>
      <CopyableInput
        placeholder={game === 'LOL' ? 'Name#TAG or account id' : 'Your in-game UID'}
        value={inGameUid}
        onChangeText={(t) => setInGameUid(sanitizeGameUid(game, t))}
        keyboardType={game === 'LOL' ? 'default' : 'number-pad'}
        inputMode={game === 'LOL' ? 'text' : 'numeric'}
      />
      {ffRequired ? <Text style={styles.requiredHint}>* Required</Text> : null}

      <SoftPressable
        style={[
          shared.button,
          (isSaving || !canSave) && shared.buttonDisabled,
        ]}
        disabled={isSaving || !canSave}
        onPress={onSave}
        pressScale={0.98}
      >
        <ButtonLabel icon={mustComplete && game === 'FREE_FIRE' ? 'arrow-forward' : 'save'}>
          {isSaving
            ? 'Saving…'
            : mustComplete && game === 'FREE_FIRE'
              ? 'Continue'
              : 'Save'}
        </ButtonLabel>
      </SoftPressable>

      {game !== 'FREE_FIRE' &&
      (role || inGameName.trim() || inGameUid.trim()) ? (
        <SoftPressable
          style={[styles.clearGameBtn, isSaving && shared.buttonDisabled]}
          disabled={isSaving}
          onPress={() => void onClearOptional()}
          pressScale={0.98}
        >
          <ButtonLabel icon="trash" color={colors.danger}>
            Clear {gameLabel(game)}
          </ButtonLabel>
        </SoftPressable>
      ) : null}
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
            <IconActionButton
              icon="trash-outline"
              label={`Remove ${device.name}`}
              tooltip="Remove"
              danger
              style={staticStyles.deviceActionBtn}
              onPress={() => onRemoveDevice(device.id)}
            />
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
  startEditing = false,
  onUpdated,
  onAdvance,
  showToast,
}: {
  profile: Profile;
  mustComplete?: boolean;
  startEditing?: boolean;
  onUpdated: (updated: Profile) => void | Promise<void>;
  onAdvance?: () => void | Promise<void>;
  showToast: (message: string) => void;
}) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(profileStyles);
  const [isEditing, setIsEditing] = useState(startEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState(profile.whatsappUrl ?? '');
  const [instagramUrl, setInstagramUrl] = useState(profile.instagramUrl ?? '');
  const [discordUrl, setDiscordUrl] = useState(profile.discordUrl ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(profile.youtubeUrl ?? '');
  const [kickUrl, setKickUrl] = useState(profile.kickUrl ?? '');

  const onSave = async () => {
    const invalid = validateAllSocialUrls({
      whatsapp: whatsappUrl,
      instagram: instagramUrl,
      discord: discordUrl,
      youtube: youtubeUrl,
      kick: kickUrl,
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
        kickUrl: kickUrl.trim() || undefined,
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
        <CopyableField label="Kick" value={profile.kickUrl ?? ''} />

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
      <Text style={staticStyles.sectionLabel}>Kick</Text>
      <CopyableInput
        placeholder={SOCIAL_PLACEHOLDERS.kick}
        autoCapitalize="none"
        value={kickUrl}
        onChangeText={setKickUrl}
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
  deviceActionBtn: { width: 44, height: 44 },
  // Clear air between the phone-verify block and the primary Save/Continue button.
  saveButton: { marginTop: 24 },
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
  gamePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
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
    gameBlock: {
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    gameTitle: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 15,
      marginBottom: 4,
    },
    gameMeta: {
      color: c.link,
      fontWeight: '600' as const,
      fontSize: 13,
      marginBottom: 6,
    },
    gameChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: c.surface,
    },
    gameChipActive: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    gameChipText: { color: c.textMuted, fontWeight: '600' as const, fontSize: 13 },
    gameChipTextActive: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 13,
    },
    optionalHint: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 4,
      marginBottom: 4,
      lineHeight: 17,
    },
    clearGameBtn: {
      marginTop: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      paddingVertical: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
  };
}
