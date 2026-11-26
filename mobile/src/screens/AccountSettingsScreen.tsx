import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  TextInput,
  View,
  ScrollView,
  Switch,
  Platform,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import { GameId, Profile, UpdateProfileInput } from '../api/types';
import { GAME_OPTIONS } from '../api/profileGames';
import { useAuth } from '../auth/AuthContext';
import {
  getBiometricEnabled,
  setBiometricEnabled,
} from '../storage/tokenStorage';
import {
  BiometricKind,
  describeBiometricKinds,
  getBiometricKinds,
  isBiometricAvailable,
  promptBiometricAuth,
} from '../auth/biometrics';
import { useDateTimeFormat } from '../datetime/DateTimeFormatContext';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { BookStage, useBookTabs } from '../ui/BookTabs';
import { PasswordField } from '../ui/PasswordField';
import { confirmAsync } from '../ui/confirmAsync';
import { emitToast } from '../ui/toastBus';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

type Props = NativeStackScreenProps<MainStackParamList, 'AccountSettings'>;
type Tab =
  | 'password'
  | 'twoFactor'
  | 'biometric'
  | 'privacy'
  | 'sessions'
  | 'recovery';

const ACCOUNT_TAB_IDS: Tab[] = [
  'password',
  'twoFactor',
  'biometric',
  'privacy',
  'sessions',
  'recovery',
];

type PrivacyFlag = keyof Pick<
  UpdateProfileInput,
  | 'showPhoneToMembers'
  | 'showWhatsappToMembers'
  | 'showInstagramToMembers'
  | 'showDiscordToMembers'
  | 'showYoutubeToMembers'
  | 'showKickToMembers'
>;

const PRIVACY_TOGGLES: Array<{
  key: PrivacyFlag;
  label: string;
  hint: string;
}> = [
  {
    key: 'showPhoneToMembers',
    label: 'Phone Number',
    hint: 'Teammates can see your verified number on your profile.',
  },
  {
    key: 'showWhatsappToMembers',
    label: 'WhatsApp',
    hint: 'Show your WhatsApp link on your member profile.',
  },
  {
    key: 'showInstagramToMembers',
    label: 'Instagram',
    hint: 'Show your Instagram link on your member profile.',
  },
  {
    key: 'showDiscordToMembers',
    label: 'Discord',
    hint: 'Show your Discord link on your member profile.',
  },
  {
    key: 'showYoutubeToMembers',
    label: 'YouTube',
    hint: 'Show your YouTube link on your member profile.',
  },
  {
    key: 'showKickToMembers',
    label: 'Kick',
    hint: 'Show your Kick link on your member profile.',
  },
];

const DEFAULT_PRIVACY: Record<PrivacyFlag, boolean> = {
  showPhoneToMembers: false,
  showWhatsappToMembers: true,
  showInstagramToMembers: true,
  showDiscordToMembers: true,
  showYoutubeToMembers: true,
  showKickToMembers: true,
};

type GameVisibility = Record<
  GameId,
  { showNameToMembers: boolean; showUidToMembers: boolean }
>;

type GameVisibilityKey = `${GameId}:name` | `${GameId}:uid`;

function defaultGameVisibility(): GameVisibility {
  return {
    FREE_FIRE: { showNameToMembers: true, showUidToMembers: true },
    BGMI: { showNameToMembers: true, showUidToMembers: true },
    MOBILE_LEGENDS: { showNameToMembers: true, showUidToMembers: true },
    LOL: { showNameToMembers: true, showUidToMembers: true },
  };
}

function gameVisibilityFromProfile(profile: Profile): GameVisibility {
  const next = defaultGameVisibility();
  for (const row of profile.gameProfiles ?? []) {
    if (!(row.game in next)) continue;
    const game = row.game as GameId;
    next[game] = {
      showNameToMembers: row.showNameToMembers ?? true,
      showUidToMembers: row.showUidToMembers ?? true,
    };
  }
  // Legacy Free Fire columns with no game-profile row yet still default on.
  return next;
}

function sessionTitle(row: authApi.AuthSessionRow): string {
  if (row.deviceName?.trim()) return row.deviceName.trim();
  if (row.platform === 'mobile') return 'Mobile app';
  if (row.platform) return row.platform;
  return 'Unknown device';
}

export function AccountSettingsScreen({ navigation }: Props) {
  const { user, applyAuthResponse, refreshUser } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(accountStyles);
  const { formatDateTime } = useDateTimeFormat();
  const { tab, openTab, turn } = useBookTabs(ACCOUNT_TAB_IDS, 'password');
  const accountTab = tab as Tab;

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricKinds, setBiometricKinds] = useState<BiometricKind[]>([]);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
    // Capability, not enrollment — labels the toggle with what this specific
    // device actually reports (Face Unlock / Fingerprint / both) instead of
    // a blanket "Face ID / Touch ID" that may promise a method the device
    // doesn't really expose to apps.
    getBiometricKinds().then(setBiometricKinds);
    getBiometricEnabled().then(setBiometricEnabledState);
  }, []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);

  const [privacy, setPrivacy] =
    useState<Record<PrivacyFlag, boolean>>(DEFAULT_PRIVACY);
  const [gameVisibility, setGameVisibility] = useState<GameVisibility>(
    defaultGameVisibility,
  );
  const [privacyLoaded, setPrivacyLoaded] = useState(false);
  const [savingPrivacyKey, setSavingPrivacyKey] = useState<
    PrivacyFlag | GameVisibilityKey | null
  >(null);

  const [sessions, setSessions] = useState<authApi.AuthSessionRow[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionsBusyId, setSessionsBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const [recovery, setRecovery] = useState<authApi.RecoveryEmailState | null>(
    null,
  );
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [recoveryEmailDraft, setRecoveryEmailDraft] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPendingEmail, setRecoveryPendingEmail] = useState<
    string | null
  >(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const loadPrivacy = useCallback(async () => {
    try {
      const profile = await usersApi.getMyProfile();
      setPrivacy({
        showPhoneToMembers:
          profile.showPhoneToMembers ?? DEFAULT_PRIVACY.showPhoneToMembers,
        showWhatsappToMembers:
          profile.showWhatsappToMembers ??
          DEFAULT_PRIVACY.showWhatsappToMembers,
        showInstagramToMembers:
          profile.showInstagramToMembers ??
          DEFAULT_PRIVACY.showInstagramToMembers,
        showDiscordToMembers:
          profile.showDiscordToMembers ?? DEFAULT_PRIVACY.showDiscordToMembers,
        showYoutubeToMembers:
          profile.showYoutubeToMembers ?? DEFAULT_PRIVACY.showYoutubeToMembers,
        showKickToMembers:
          profile.showKickToMembers ?? DEFAULT_PRIVACY.showKickToMembers,
      });
      setGameVisibility(gameVisibilityFromProfile(profile));
      setPrivacyLoaded(true);
    } catch {
      /* API error toasted by axios interceptor */
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const rows = await authApi.listSessions();
      setSessions(rows);
      setSessionsLoaded(true);
    } catch {
      /* API error toasted by axios interceptor */
    }
  }, []);

  const loadRecovery = useCallback(async () => {
    try {
      const state = await authApi.getRecoveryEmail();
      setRecovery(state);
      setRecoveryLoaded(true);
      if (state.recoveryEmail && !state.verified) {
        setRecoveryPendingEmail(state.recoveryEmail);
        setRecoveryEmailDraft(state.recoveryEmail);
      }
    } catch {
      /* API error toasted by axios interceptor */
    }
  }, []);

  useEffect(() => {
    if (accountTab === 'privacy' && !privacyLoaded) {
      void loadPrivacy();
    }
    if (accountTab === 'sessions') {
      void loadSessions();
    }
    if (accountTab === 'recovery' && !recoveryLoaded) {
      void loadRecovery();
    }
  }, [
    accountTab,
    privacyLoaded,
    loadPrivacy,
    loadSessions,
    recoveryLoaded,
    loadRecovery,
  ]);

  const onTogglePrivacy = async (key: PrivacyFlag, value: boolean) => {
    const previous = privacy[key];
    setPrivacy((prev) => ({ ...prev, [key]: value }));
    setSavingPrivacyKey(key);
    try {
      const updated: Profile = await usersApi.updateMyProfile({ [key]: value });
      setPrivacy((prev) => ({
        ...prev,
        [key]: (updated[key] as boolean | undefined) ?? value,
      }));
      emitToast(value ? 'Visible to teammates' : 'Hidden from teammates');
    } catch {
      setPrivacy((prev) => ({ ...prev, [key]: previous }));
    } finally {
      setSavingPrivacyKey(null);
    }
  };

  const onToggleGameVisibility = async (
    game: GameId,
    field: 'showNameToMembers' | 'showUidToMembers',
    value: boolean,
  ) => {
    const key: GameVisibilityKey = `${game}:${
      field === 'showNameToMembers' ? 'name' : 'uid'
    }`;
    const previous = gameVisibility[game];
    setGameVisibility((prev) => ({
      ...prev,
      [game]: { ...prev[game], [field]: value },
    }));
    setSavingPrivacyKey(key);
    try {
      const updated = await usersApi.setGameProfileVisibility({
        game,
        [field]: value,
      });
      setGameVisibility(gameVisibilityFromProfile(updated));
      emitToast(value ? 'Visible to teammates' : 'Hidden from teammates');
    } catch {
      setGameVisibility((prev) => ({ ...prev, [game]: previous }));
    } finally {
      setSavingPrivacyKey(null);
    }
  };

  const canChangePassword =
    currentPassword.trim() &&
    newPassword.trim().length >= 8 &&
    newPassword === confirmPassword;

  const onChangePassword = async () => {
    setIsSavingPassword(true);
    try {
      const response = await authApi.changePassword(
        currentPassword,
        newPassword,
      );
      await applyAuthResponse(response);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      emitToast('Password changed');
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    } finally {
      setIsSavingPassword(false);
    }
  };

  const onDisableTwoFactor = async () => {
    setIsDisabling(true);
    try {
      await authApi.disableTwoFactor(disablePassword);
      await refreshUser();
      setShowDisableForm(false);
      setDisablePassword('');
      emitToast('Two-factor authentication disabled');
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    } finally {
      setIsDisabling(false);
    }
  };

  const onToggleBiometric = async (value: boolean) => {
    setIsTogglingBiometric(true);
    try {
      // Both enable and disable require a successful scan — otherwise anyone
      // holding an unlocked phone could turn biometric unlock off.
      const confirmed = await promptBiometricAuth(
        value
          ? 'Confirm to enable biometric login'
          : 'Confirm to disable biometric login',
      );
      if (!confirmed) return;
      await setBiometricEnabled(value);
      setBiometricEnabledState(value);
      emitToast(value ? 'Biometric login enabled' : 'Biometric login disabled');
    } finally {
      setIsTogglingBiometric(false);
    }
  };

  const onToggleTrust = async (row: authApi.AuthSessionRow, trusted: boolean) => {
    setSessionsBusyId(row.id);
    setSessions((prev) =>
      prev.map((s) => (s.id === row.id ? { ...s, trusted } : s)),
    );
    try {
      await authApi.setSessionTrust(row.id, trusted);
      emitToast(trusted ? 'Marked as trusted' : 'Trust removed');
    } catch {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === row.id ? { ...s, trusted: row.trusted } : s,
        ),
      );
    } finally {
      setSessionsBusyId(null);
    }
  };

  const onRevokeSession = async (row: authApi.AuthSessionRow) => {
    const ok = await confirmAsync(
      'End this session?',
      `${sessionTitle(row)} will be signed out immediately.`,
      'End session',
    );
    if (!ok) return;
    setSessionsBusyId(row.id);
    try {
      await authApi.revokeSession(row.id);
      setSessions((prev) => prev.filter((s) => s.id !== row.id));
      emitToast('Session ended');
    } catch {
      /* toasted */
    } finally {
      setSessionsBusyId(null);
    }
  };

  const onRevokeOtherSessions = async () => {
    const others = sessions.filter((s) => !s.current).length;
    if (others === 0) {
      emitToast('No other sessions');
      return;
    }
    const ok = await confirmAsync(
      'Sign out other devices?',
      `${others} other session${others === 1 ? '' : 's'} will end. This device stays signed in.`,
      'Sign out others',
    );
    if (!ok) return;
    setRevokingOthers(true);
    try {
      const result = await authApi.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.current));
      emitToast(
        result.revoked
          ? `Signed out ${result.revoked} other device${result.revoked === 1 ? '' : 's'}`
          : 'No other sessions',
      );
    } catch {
      /* toasted */
    } finally {
      setRevokingOthers(false);
    }
  };

  const onSendRecoveryCode = async () => {
    const email = recoveryEmailDraft.trim().toLowerCase();
    if (!email.includes('@')) {
      emitToast('Enter a valid email');
      return;
    }
    setRecoveryBusy(true);
    try {
      const result = await authApi.requestRecoveryEmail(email);
      setRecoveryPendingEmail(result.email);
      setRecoveryCode('');
      emitToast('Verification code sent');
    } catch {
      /* toasted */
    } finally {
      setRecoveryBusy(false);
    }
  };

  const onVerifyRecoveryCode = async () => {
    if (recoveryCode.trim().length !== 6) {
      emitToast('Enter the 6-digit code');
      return;
    }
    setRecoveryBusy(true);
    try {
      const state = await authApi.verifyRecoveryEmail(recoveryCode.trim());
      setRecovery(state);
      setRecoveryPendingEmail(null);
      setRecoveryCode('');
      setRecoveryEmailDraft('');
      emitToast('Recovery email verified');
    } catch {
      /* toasted */
    } finally {
      setRecoveryBusy(false);
    }
  };

  const onClearRecoveryEmail = async () => {
    const ok = await confirmAsync(
      'Remove recovery email?',
      'Password reset will only go to your primary sign-in email after this.',
      'Remove',
    );
    if (!ok) return;
    setRecoveryBusy(true);
    try {
      await authApi.clearRecoveryEmail();
      setRecovery({
        recoveryEmail: null,
        verified: false,
        verifiedAt: null,
      });
      setRecoveryPendingEmail(null);
      setRecoveryEmailDraft('');
      setRecoveryCode('');
      emitToast('Recovery email removed');
    } catch {
      /* toasted */
    } finally {
      setRecoveryBusy(false);
    }
  };

  if (!user) return null;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={staticStyles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.sectionLabel}>Privacy & Security</Text>
        <Text style={styles.lead}>
          Lock down your account, and choose what teammates can see on your
          profile.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={staticStyles.tabTrack}
          style={staticStyles.tabTrackScroll}
        >
          {(
            [
              ['password', 'Password', 'Change Password'],
              ['twoFactor', '2FA', 'Two-Factor Authentication'],
              ['biometric', 'Biometric', 'Biometric Login'],
              ['privacy', 'Privacy', 'Profile Privacy'],
              ['sessions', 'Sessions', 'Active Sessions'],
              ['recovery', 'Recovery', 'Recovery Email'],
            ] as const
          ).map(([value, label, a11y]) => {
            const active = accountTab === value;
            return (
              <SoftPressable
                key={value}
                style={[staticStyles.tab, active && styles.tabActive]}
                onPress={() => openTab(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={a11y}
                pressScale={0.96}
              >
                <Text
                  style={active ? styles.tabTextActive : styles.tabText}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </SoftPressable>
            );
          })}
        </ScrollView>

        <BookStage tab={tab} turn={turn}>
          {(active) =>
            active === 'password' ? (
              <View style={staticStyles.card}>
                <Text style={styles.cardTitle}>Change Password</Text>
                {!user.hasPassword ? (
                  <Text style={styles.hint}>
                    This account signs in with Google and has no password to
                    change.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.hint}>
                      Use at least 8 characters. You&apos;ll stay signed in after
                      updating.
                    </Text>
                    <PasswordField
                      placeholder="Current password"
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                    />
                    <PasswordField
                      placeholder="New password"
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                    <PasswordField
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                    <SoftPressable
                      style={[
                        styles.primaryBtn,
                        (isSavingPassword || !canChangePassword) &&
                          staticStyles.btnDisabled,
                      ]}
                      disabled={isSavingPassword || !canChangePassword}
                      onPress={onChangePassword}
                      pressScale={0.98}
                    >
                      <ButtonLabel icon="save">
                        {isSavingPassword ? 'Saving…' : 'Update Password'}
                      </ButtonLabel>
                    </SoftPressable>
                  </>
                )}
              </View>
            ) : active === 'twoFactor' ? (
              <View style={staticStyles.card}>
                <Text style={styles.cardTitle}>Two-Factor Authentication</Text>
                <Text style={styles.hint}>
                  Uses Google Authenticator (or any TOTP-compatible app).
                </Text>
                <View
                  style={[
                    staticStyles.statusPill,
                    user.twoFactorEnabled
                      ? staticStyles.statusOn
                      : styles.statusOff,
                  ]}
                >
                  <View
                    style={[
                      staticStyles.statusDot,
                      {
                        backgroundColor: user.twoFactorEnabled
                          ? '#86efac'
                          : colors.textDim,
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {user.twoFactorEnabled
                      ? 'Enabled — code required at login'
                      : 'Disabled — add an extra layer'}
                  </Text>
                </View>

                {user.twoFactorEnabled ? (
                  showDisableForm ? (
                    <>
                      <PasswordField
                        placeholder="Your password"
                        value={disablePassword}
                        onChangeText={setDisablePassword}
                      />
                      <SoftPressable
                        style={[
                          styles.primaryBtn,
                          (isDisabling || !disablePassword) &&
                            staticStyles.btnDisabled,
                        ]}
                        disabled={isDisabling || !disablePassword}
                        onPress={onDisableTwoFactor}
                        pressScale={0.98}
                      >
                        <ButtonLabel icon="trash">
                          {isDisabling ? 'Disabling…' : 'Confirm Disable'}
                        </ButtonLabel>
                      </SoftPressable>
                    </>
                  ) : (
                    <SoftPressable
                      style={styles.dangerBtn}
                      onPress={() => setShowDisableForm(true)}
                      pressScale={0.98}
                    >
                      <ButtonLabel icon="trash" color={colors.danger}>
                        Disable 2FA
                      </ButtonLabel>
                    </SoftPressable>
                  )
                ) : (
                  <SoftPressable
                    style={styles.primaryBtn}
                    onPress={() => navigation.navigate('TwoFactorSetup')}
                    pressScale={0.98}
                  >
                    <ButtonLabel icon="check">Enable 2FA</ButtonLabel>
                  </SoftPressable>
                )}
              </View>
            ) : active === 'biometric' ? (
              <View style={staticStyles.card}>
                <Text style={styles.cardTitle}>Biometric Login</Text>
                {!biometricAvailable ? (
                  <Text style={styles.hint}>
                    {Platform.OS === 'web'
                      ? "Biometric login isn't available in this browser preview — try it on a real device."
                      : "Biometric login isn't available on this device (no Face ID/Touch ID/fingerprint set up)."}
                  </Text>
                ) : (
                  <View style={staticStyles.settingRow}>
                    <View style={staticStyles.settingTextCol}>
                      <Text style={styles.settingLead}>
                        Unlock with {describeBiometricKinds(biometricKinds)}
                      </Text>
                      <Text style={styles.hint}>
                        Skip retyping passwords when you reopen the app on this
                        device.
                      </Text>
                      {Platform.OS === 'android' && !biometricKinds.includes('face') ? (
                        <Text style={styles.hint}>
                          No Face Unlock option here because this device
                          doesn&apos;t expose one to apps — some Android face
                          unlock features are lock-screen-only and never
                          register with the system that lets apps use it.
                        </Text>
                      ) : null}
                    </View>
                    <Switch
                      disabled={isTogglingBiometric}
                      value={biometricEnabled}
                      onValueChange={onToggleBiometric}
                      accessibilityLabel="Enable biometric login"
                      trackColor={{
                        false: colors.border,
                        true: 'rgba(201,204,209,0.55)',
                      }}
                      thumbColor={
                        biometricEnabled ? colors.chrome : colors.textMuted
                      }
                    />
                  </View>
                )}
              </View>
            ) : active === 'sessions' ? (
              <View style={staticStyles.card}>
                <Text style={styles.cardTitle}>Active Sessions</Text>
                <Text style={styles.hint}>
                  Devices signed into your account. Mark trusted ones you
                  recognize, or end anything that looks unfamiliar.
                </Text>
                {!sessionsLoaded && sessions.length === 0 ? (
                  <Text style={styles.hint}>Loading…</Text>
                ) : (
                  <>
                    {sessions.map((row, index) => {
                      const busy = sessionsBusyId === row.id;
                      return (
                        <View
                          key={row.id}
                          style={[
                            staticStyles.sessionRow,
                            index < sessions.length - 1 &&
                              styles.privacyRowBorder,
                          ]}
                        >
                          <View style={staticStyles.settingTextCol}>
                            <Text style={styles.privacyFieldLabel}>
                              {sessionTitle(row)}
                              {row.current ? ' · This device' : ''}
                            </Text>
                            <Text style={styles.privacyHint}>
                              Last active {formatDateTime(row.lastSeenAt)}
                              {row.ip ? ` · ${row.ip}` : ''}
                            </Text>
                            <View style={staticStyles.sessionTrustRow}>
                              <Text style={styles.sessionTrustLabel}>
                                Trusted device
                              </Text>
                              <Switch
                                disabled={busy}
                                value={row.trusted}
                                onValueChange={(value) =>
                                  void onToggleTrust(row, value)
                                }
                                accessibilityLabel={`Trust ${sessionTitle(row)}`}
                                trackColor={{
                                  false: colors.border,
                                  true: 'rgba(201,204,209,0.55)',
                                }}
                                thumbColor={
                                  row.trusted ? colors.chrome : colors.textMuted
                                }
                              />
                            </View>
                          </View>
                          {!row.current ? (
                            <SoftPressable
                              style={[
                                styles.sessionRevokeBtn,
                                busy && staticStyles.btnDisabled,
                              ]}
                              disabled={busy}
                              onPress={() => void onRevokeSession(row)}
                              pressScale={0.96}
                              accessibilityLabel={`End session on ${sessionTitle(row)}`}
                            >
                              <Text style={styles.sessionRevokeText}>End</Text>
                            </SoftPressable>
                          ) : null}
                        </View>
                      );
                    })}
                    {sessions.some((s) => !s.current) ? (
                      <SoftPressable
                        style={[
                          styles.dangerBtn,
                          revokingOthers && staticStyles.btnDisabled,
                        ]}
                        disabled={revokingOthers}
                        onPress={() => void onRevokeOtherSessions()}
                        pressScale={0.98}
                      >
                        <ButtonLabel icon="logout" color={colors.danger}>
                          {revokingOthers
                            ? 'Signing out…'
                            : 'Sign out other devices'}
                        </ButtonLabel>
                      </SoftPressable>
                    ) : null}
                  </>
                )}
              </View>
            ) : active === 'recovery' ? (
              <View style={staticStyles.card}>
                <Text style={styles.cardTitle}>Recovery Email</Text>
                <Text style={styles.hint}>
                  A second inbox for password resets if you lose access to{' '}
                  {user.email}.
                </Text>
                {!recoveryLoaded ? (
                  <Text style={styles.hint}>Loading…</Text>
                ) : recovery?.verified && recovery.recoveryEmail ? (
                  <>
                    <View
                      style={[
                        staticStyles.statusPill,
                        staticStyles.statusOn,
                      ]}
                    >
                      <View
                        style={[
                          staticStyles.statusDot,
                          { backgroundColor: '#86efac' },
                        ]}
                      />
                      <Text style={styles.statusText}>
                        Verified · {recovery.recoveryEmail}
                      </Text>
                    </View>
                    <SoftPressable
                      style={[
                        styles.dangerBtn,
                        recoveryBusy && staticStyles.btnDisabled,
                      ]}
                      disabled={recoveryBusy}
                      onPress={() => void onClearRecoveryEmail()}
                      pressScale={0.98}
                    >
                      <ButtonLabel icon="trash" color={colors.danger}>
                        Remove recovery email
                      </ButtonLabel>
                    </SoftPressable>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={styles.field}
                      placeholder="Recovery email"
                      placeholderTextColor={colors.textDim}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      value={recoveryEmailDraft}
                      onChangeText={setRecoveryEmailDraft}
                      editable={!recoveryBusy}
                    />
                    <SoftPressable
                      style={[
                        styles.primaryBtn,
                        (recoveryBusy || !recoveryEmailDraft.trim()) &&
                          staticStyles.btnDisabled,
                      ]}
                      disabled={recoveryBusy || !recoveryEmailDraft.trim()}
                      onPress={() => void onSendRecoveryCode()}
                      pressScale={0.98}
                    >
                      <ButtonLabel icon="send">
                        {recoveryBusy
                          ? 'Sending…'
                          : recoveryPendingEmail
                            ? 'Resend code'
                            : 'Send verification code'}
                      </ButtonLabel>
                    </SoftPressable>
                    {recoveryPendingEmail ? (
                      <>
                        <Text style={styles.hint}>
                          Enter the 6-digit code sent to {recoveryPendingEmail}.
                        </Text>
                        <TextInput
                          style={styles.field}
                          placeholder="6-digit code"
                          placeholderTextColor={colors.textDim}
                          keyboardType="number-pad"
                          maxLength={6}
                          value={recoveryCode}
                          onChangeText={setRecoveryCode}
                          editable={!recoveryBusy}
                        />
                        <SoftPressable
                          style={[
                            styles.primaryBtn,
                            (recoveryBusy || recoveryCode.trim().length !== 6) &&
                              staticStyles.btnDisabled,
                          ]}
                          disabled={
                            recoveryBusy || recoveryCode.trim().length !== 6
                          }
                          onPress={() => void onVerifyRecoveryCode()}
                          pressScale={0.98}
                        >
                          <ButtonLabel icon="check">
                            {recoveryBusy ? 'Verifying…' : 'Verify email'}
                          </ButtonLabel>
                        </SoftPressable>
                      </>
                    ) : null}
                  </>
                )}
              </View>
            ) : (
              <View style={staticStyles.card}>
                <Text style={styles.cardTitle}>Visible To Teammates</Text>
                <Text style={styles.hint}>
                  Turn on what others can see on your member profile. Off means
                  hidden — your own Profile screen still shows everything.
                </Text>
                {!privacyLoaded ? (
                  <Text style={styles.hint}>Loading…</Text>
                ) : (
                  <>
                    <Text style={styles.privacyGroupLabel}>Contact</Text>
                    {PRIVACY_TOGGLES.map((row) => {
                      const on = privacy[row.key];
                      return (
                        <View
                          key={row.key}
                          style={[
                            staticStyles.privacyRow,
                            styles.privacyRowBorder,
                          ]}
                        >
                          <View style={staticStyles.settingTextCol}>
                            <Text style={styles.settingLead}>{row.label}</Text>
                            <Text style={styles.privacyHint}>{row.hint}</Text>
                          </View>
                          <Switch
                            disabled={savingPrivacyKey === row.key}
                            value={on}
                            onValueChange={(next) =>
                              void onTogglePrivacy(row.key, next)
                            }
                            accessibilityLabel={`Show ${row.label} to teammates`}
                            accessibilityState={{ checked: on }}
                            trackColor={{
                              false: colors.border,
                              true: 'rgba(201,204,209,0.55)',
                            }}
                            thumbColor={on ? colors.chrome : colors.textMuted}
                          />
                        </View>
                      );
                    })}

                    <Text style={[styles.privacyGroupLabel, { marginTop: 16 }]}>
                      Games — IGN & UID
                    </Text>
                    <Text style={styles.privacyHint}>
                      Control IGN and UID separately for each title you play.
                    </Text>
                    {GAME_OPTIONS.map((opt) => {
                      const vis = gameVisibility[opt.id];
                      const nameKey: GameVisibilityKey = `${opt.id}:name`;
                      const uidKey: GameVisibilityKey = `${opt.id}:uid`;
                      const uidLabel =
                        opt.id === 'LOL' ? 'Riot ID / UID' : 'UID';
                      return (
                        <View key={opt.id} style={staticStyles.gamePrivacyBlock}>
                          <Text style={styles.settingLead}>{opt.label}</Text>
                          <View
                            style={[
                              staticStyles.privacyRow,
                              styles.privacyRowBorder,
                            ]}
                          >
                            <View style={staticStyles.settingTextCol}>
                              <Text style={styles.privacyFieldLabel}>IGN</Text>
                            </View>
                            <Switch
                              disabled={savingPrivacyKey === nameKey}
                              value={vis.showNameToMembers}
                              onValueChange={(next) =>
                                void onToggleGameVisibility(
                                  opt.id,
                                  'showNameToMembers',
                                  next,
                                )
                              }
                              accessibilityLabel={`Show ${opt.label} IGN to teammates`}
                              accessibilityState={{
                                checked: vis.showNameToMembers,
                              }}
                              trackColor={{
                                false: colors.border,
                                true: 'rgba(201,204,209,0.55)',
                              }}
                              thumbColor={
                                vis.showNameToMembers
                                  ? colors.chrome
                                  : colors.textMuted
                              }
                            />
                          </View>
                          <View style={staticStyles.privacyRow}>
                            <View style={staticStyles.settingTextCol}>
                              <Text style={styles.privacyFieldLabel}>
                                {uidLabel}
                              </Text>
                            </View>
                            <Switch
                              disabled={savingPrivacyKey === uidKey}
                              value={vis.showUidToMembers}
                              onValueChange={(next) =>
                                void onToggleGameVisibility(
                                  opt.id,
                                  'showUidToMembers',
                                  next,
                                )
                              }
                              accessibilityLabel={`Show ${opt.label} ${uidLabel} to teammates`}
                              accessibilityState={{
                                checked: vis.showUidToMembers,
                              }}
                              trackColor={{
                                false: colors.border,
                                true: 'rgba(201,204,209,0.55)',
                              }}
                              thumbColor={
                                vis.showUidToMembers
                                  ? colors.chrome
                                  : colors.textMuted
                              }
                            />
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            )
          }
        </BookStage>

      </ScrollView>
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  tabTrackScroll: {
    marginBottom: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabTrack: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
  },
  tab: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  btnDisabled: { opacity: 0.45 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  statusOn: {
    backgroundColor: 'rgba(134,239,172,0.08)',
    borderColor: 'rgba(134,239,172,0.28)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  settingTextCol: { flex: 1, minWidth: 180 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  gamePrivacyBlock: {
    marginTop: 10,
    marginBottom: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  sessionTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function accountStyles(c: ThemeColors) {
  return {
    eyebrow: {
      color: c.textDim,
      fontSize: 12,
      fontWeight: '700' as const,
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
      marginBottom: 6,
    },
    sectionLabel: {
      fontSize: 28,
      fontWeight: '700' as const,
      color: c.text,
      letterSpacing: -0.4,
    },
    lead: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
      marginBottom: 20,
    },
    tabActive: {
      backgroundColor: c.chrome,
    },
    tabText: { color: c.textMuted, fontWeight: '600' as const, fontSize: 13 },
    tabTextActive: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 13,
    },
    cardTitle: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 17,
      marginBottom: 8,
    },
    hint: {
      color: c.textMuted,
      fontSize: 13,
      marginBottom: 12,
      lineHeight: 19,
    },
    settingLead: {
      color: c.text,
      fontWeight: '600' as const,
      fontSize: 14,
      marginBottom: 4,
    },
    privacyHint: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 0,
    },
    privacyGroupLabel: {
      color: c.textDim,
      fontSize: 12,
      fontWeight: '700' as const,
      letterSpacing: 0.6,
      textTransform: 'uppercase' as const,
      marginBottom: 4,
      marginTop: 4,
    },
    privacyFieldLabel: {
      color: c.text,
      fontSize: 14,
      fontWeight: '600' as const,
    },
    privacyRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    primaryBtn: {
      backgroundColor: c.chrome,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginTop: 6,
    },
    dangerBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginTop: 6,
    },
    statusOff: {
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderColor: c.border,
    },
    statusText: { color: c.text, fontSize: 12, fontWeight: '600' as const },
    sessionTrustLabel: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '600' as const,
    },
    sessionRevokeBtn: {
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginTop: 4,
    },
    sessionRevokeText: {
      color: c.danger,
      fontSize: 13,
      fontWeight: '700' as const,
    },
    field: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontSize: 15,
      marginBottom: 10,
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
  };
}
