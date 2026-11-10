import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  ScrollView,
  TextInput,
  Switch,
  Platform,
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
import { BookStage, useBookTabs } from '../ui/BookTabs';
import { emitToast } from '../ui/toastBus';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

type Props = NativeStackScreenProps<MainStackParamList, 'AccountSettings'>;
type Tab = 'password' | 'twoFactor' | 'biometric';

const ACCOUNT_TAB_IDS: Tab[] = ['password', 'twoFactor', 'biometric'];

export function AccountSettingsScreen({ navigation }: Props) {
  const { user, applyAuthResponse, refreshUser } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(accountStyles);
  const { tab, openTab, turn } = useBookTabs(ACCOUNT_TAB_IDS, 'password');
  const accountTab = tab as Tab;

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
        <Text style={styles.sectionLabel}>Security</Text>
        <Text style={styles.lead}>
          Keep your Sacred account locked down — password, authenticator, and
          device unlock in one place.
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
            ) : (
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
    input: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 10,
      fontSize: 16,
      color: c.text,
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
  };
}
