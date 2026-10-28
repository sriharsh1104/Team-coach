import React from 'react';
import { Text, Pressable } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';

// Shown instead of the normal Login screen when a saved session exists but
// the user has enabled biometric unlock and hasn't passed it yet this app
// open. No navigation props — RootNavigator renders this standalone,
// exactly like its existing bare loading-spinner branch.
export function BiometricLockScreen() {
  const { retryBiometricUnlock, dismissBiometricLock } = useAuth();

  return (
    <FormScreen>
      <BrandMark />
      <Text style={authStyles.title}>Unlock Team Coach</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        Use Face ID / Touch ID / fingerprint to continue.
      </Text>
      <Pressable style={authStyles.button} onPress={() => retryBiometricUnlock()}>
        <ButtonLabel icon="check">Unlock</ButtonLabel>
      </Pressable>
      <Text style={authStyles.link} onPress={dismissBiometricLock}>
        Use password instead
      </Text>
    </FormScreen>
  );
}
