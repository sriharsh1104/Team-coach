import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  ScrollView,
  TextInput,
  Switch,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as authApi from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import {
  getBiometricEnabled,
  setBiometricEnabled,
} from '../storage/tokenStorage';
import { isBiometricAvailable, promptBiometricAuth } from '../auth/biometrics';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { FadeSwap } from '../ui/FadeSwap';
import { Toast, useToast } from '../ui/Toast';
import { colors } from '../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'AccountSettings'>;
type Tab = 'password' | 'twoFactor' | 'biometric';

export function AccountSettingsScreen({ navigation }: Props) {
  const { user, applyAuthResponse, refreshUser } = useAuth();
  const { message: toastMessage, showToast } = useToast();
  const [tab, setTab] = useState<Tab>('password');

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
    getBiometricEnabled().then(setBiometricEnabledState);
  }, []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);

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
      showToast('Password changed');
    } catch (err: any) {
      Alert.alert(
        'Could not change password',
        err?.response?.data?.message ?? 'Please try again.',
      );
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
      showToast('Two-factor authentication disabled');
    } catch (err: any) {
      Alert.alert(
        'Could not disable 2FA',
        err?.response?.data?.message ?? 'Please try again.',
      );
    } finally {
      setIsDisabling(false);
    }
  };

  const onToggleBiometric = async (value: boolean) => {
    setIsTogglingBiometric(true);
    try {
      if (value) {
        const confirmed = await promptBiometricAuth(
          'Confirm to enable biometric login',
        );
        if (!confirmed) return;
      }
      await setBiometricEnabled(value);
      setBiometricEnabledState(value);
      showToast(value ? 'Biometric login enabled' : 'Biometric login disabled');
    } finally {
      setIsTogglingBiometric(false);
    }
  };

  if (!user) return null;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.sectionLabel}>Security</Text>
        <Text style={styles.lead}>
          Keep your Sacred account locked down — password, authenticator, and
          device unlock in one place.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabTrack}
          style={styles.tabTrackScroll}
        >
          {(
            [
              ['password', 'Password', 'Change Password'],
              ['twoFactor', '2FA', 'Two-Factor Authentication'],
              ['biometric', 'Biometric', 'Biometric Login'],
            ] as const
          ).map(([value, label, a11y]) => {
            const active = tab === value;
            return (
              <SoftPressable
                key={value}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(value)}
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

        <FadeSwap contentKey={tab}>
          {tab === 'password' && (
            <View style={styles.card}>
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
                  <TextInput
                    style={styles.input}
                    placeholder="Current password"
                    placeholderTextColor={colors.textDim}
                    secureTextEntry
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor={colors.textDim}
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.textDim}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <SoftPressable
                    style={[
                      styles.primaryBtn,
                      (isSavingPassword || !canChangePassword) &&
                        styles.btnDisabled,
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
          )}

          {tab === 'twoFactor' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Two-Factor Authentication</Text>
              <Text style={styles.hint}>
                Uses Google Authenticator (or any TOTP-compatible app).
              </Text>
              <View
                style={[
                  styles.statusPill,
                  user.twoFactorEnabled
                    ? styles.statusOn
                    : styles.statusOff,
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
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
                    <TextInput
                      style={styles.input}
                      placeholder="Your password"
                      placeholderTextColor={colors.textDim}
                      secureTextEntry
                      value={disablePassword}
                      onChangeText={setDisablePassword}
                    />
                    <SoftPressable
                      style={[
                        styles.primaryBtn,
                        (isDisabling || !disablePassword) && styles.btnDisabled,
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
          )}

          {tab === 'biometric' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Biometric Login</Text>
              {!biometricAvailable ? (
                <Text style={styles.hint}>
                  {Platform.OS === 'web'
                    ? "Biometric login isn't available in this browser preview — try it on a real device."
                    : "Biometric login isn't available on this device (no Face ID/Touch ID/fingerprint set up)."}
                </Text>
              ) : (
                <View style={styles.settingRow}>
                  <View style={styles.settingTextCol}>
                    <Text style={styles.settingLead}>
                      Unlock with Face ID / Touch ID
                    </Text>
                    <Text style={styles.hint}>
                      Skip retyping passwords when you reopen the app on this
                      device.
                    </Text>
                  </View>
                  <Switch
                    disabled={isTogglingBiometric}
                    value={biometricEnabled}
                    onValueChange={onToggleBiometric}
                    accessibilityLabel="Enable biometric login"
                    trackColor={{
                      false: '#3a3d44',
                      true: 'rgba(201,204,209,0.55)',
                    }}
                    thumbColor={
                      biometricEnabled ? colors.chrome : '#9aa0a6'
                    }
                  />
                </View>
              )}
            </View>
          )}
        </FadeSwap>
      </ScrollView>
      <Toast message={toastMessage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  eyebrow: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  },
  lead: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
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
  tabActive: {
    backgroundColor: colors.chrome,
  },
  tabText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  tabTextActive: {
    color: colors.chromeInk,
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
    marginBottom: 8,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 19,
  },
  settingLead: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    fontSize: 16,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.chrome,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  dangerBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
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
  statusOff: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: colors.border,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  settingTextCol: { flex: 1, minWidth: 180 },
});
