import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
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
import { Toast, useToast } from '../ui/Toast';
import { colors } from '../theme';
import { sharedStyles } from './shared';

type Props = NativeStackScreenProps<MainStackParamList, 'AccountSettings'>;

export function AccountSettingsScreen({ navigation }: Props) {
  const { user, applyAuthResponse, refreshUser } = useAuth();
  const { message: toastMessage, showToast } = useToast();
  const [tab, setTab] = useState<'password' | 'twoFactor' | 'biometric'>(
    'password',
  );

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
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>Security</Text>

        <View style={styles.tabRow}>
          {(
            [
              ['password', 'Change Password'],
              ['twoFactor', 'Two-Factor Authentication'],
              ['biometric', 'Biometric Login'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              style={[styles.tab, tab === value && styles.tabActive]}
              onPress={() => setTab(value)}
            >
              <Text
                style={tab === value ? styles.tabTextActive : styles.tabText}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'password' &&
          (!user.hasPassword ? (
            <Text style={styles.hint}>
              This account signs in with Google and has no password to change.
            </Text>
          ) : (
            <>
              <TextInput
                style={sharedStyles.input}
                placeholder="Current password"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="New password"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TextInput
                style={sharedStyles.input}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <Pressable
                style={[
                  sharedStyles.button,
                  (isSavingPassword || !canChangePassword) &&
                    sharedStyles.buttonDisabled,
                ]}
                disabled={isSavingPassword || !canChangePassword}
                onPress={onChangePassword}
              >
                <ButtonLabel icon="save">
                  {isSavingPassword ? 'Saving…' : 'Update Password'}
                </ButtonLabel>
              </Pressable>
            </>
          ))}

        {tab === 'twoFactor' && (
          <>
            <Text style={styles.hint}>
              Uses Google Authenticator (or any TOTP-compatible app).
            </Text>
            <View style={styles.statusRow}>
              <Text style={styles.hint}>
                {user.twoFactorEnabled
                  ? 'Enabled — an authenticator code is required at login.'
                  : 'Disabled — add an extra layer of security to your account.'}
              </Text>
            </View>

            {user.twoFactorEnabled ? (
              showDisableForm ? (
                <>
                  <TextInput
                    style={sharedStyles.input}
                    placeholder="Your password"
                    placeholderTextColor={colors.textDim}
                    secureTextEntry
                    value={disablePassword}
                    onChangeText={setDisablePassword}
                  />
                  <Pressable
                    style={[
                      sharedStyles.button,
                      (isDisabling || !disablePassword) &&
                        sharedStyles.buttonDisabled,
                    ]}
                    disabled={isDisabling || !disablePassword}
                    onPress={onDisableTwoFactor}
                  >
                    <ButtonLabel icon="trash">
                      {isDisabling ? 'Disabling…' : 'Confirm Disable'}
                    </ButtonLabel>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={[sharedStyles.button, styles.dangerButton]}
                  onPress={() => setShowDisableForm(true)}
                >
                  <ButtonLabel icon="trash" color={colors.danger}>
                    Disable 2FA
                  </ButtonLabel>
                </Pressable>
              )
            ) : (
              <Pressable
                style={sharedStyles.button}
                onPress={() => navigation.navigate('TwoFactorSetup')}
              >
                <ButtonLabel icon="check">Enable 2FA</ButtonLabel>
              </Pressable>
            )}
          </>
        )}

        {tab === 'biometric' && (
          <>
            {!biometricAvailable ? (
              <Text style={styles.hint}>
                {Platform.OS === 'web'
                  ? "Biometric login isn't available in this browser preview — try it on a real device."
                  : "Biometric login isn't available on this device (no Face ID/Touch ID/fingerprint set up)."}
              </Text>
            ) : (
              <View style={styles.settingRow}>
                <View style={styles.settingTextCol}>
                  <Text style={styles.hint}>
                    Use Face ID / Touch ID / fingerprint to unlock the app
                    instead of staying signed in silently.
                  </Text>
                </View>
                <Switch
                  disabled={isTogglingBiometric}
                  value={biometricEnabled}
                  onValueChange={onToggleBiometric}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
      <Toast message={toastMessage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    color: colors.text,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  tabActive: { backgroundColor: colors.chrome, borderColor: colors.chrome },
  tabText: { color: colors.text, fontWeight: '600' },
  tabTextActive: { color: colors.chromeInk, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
  statusRow: { marginBottom: 4 },
  dangerButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingTextCol: { flex: 1 },
});
