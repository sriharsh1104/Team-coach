import React, { useState } from 'react';
import {
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as authApi from '../api/auth';
import { useAuth } from '../auth/AuthContext';
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
      const response = await authApi.changePassword(currentPassword, newPassword);
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

  if (!user) return null;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>Security</Text>

        <Text style={styles.subLabel}>Change Password</Text>
        {!user.hasPassword ? (
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
                (isSavingPassword || !canChangePassword) && sharedStyles.buttonDisabled,
              ]}
              disabled={isSavingPassword || !canChangePassword}
              onPress={onChangePassword}
            >
              <ButtonLabel icon="save">
                {isSavingPassword ? 'Saving…' : 'Update Password'}
              </ButtonLabel>
            </Pressable>
          </>
        )}

        <Text style={[styles.subLabel, { marginTop: 28 }]}>
          Two-Factor Authentication
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
                  (isDisabling || !disablePassword) && sharedStyles.buttonDisabled,
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
  subLabel: {
    marginBottom: 8,
    fontWeight: '700',
    color: colors.text,
  },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
  statusRow: { marginBottom: 4 },
  dangerButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
});
