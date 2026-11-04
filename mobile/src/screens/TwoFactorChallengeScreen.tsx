import React, { useState } from 'react';
import { Text, TextInput, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { AuthBackButton } from '../ui/AuthBackButton';
import { ButtonLabel } from '../ui/ButtonLabel';
import { OtpBoxes, OTP_LENGTH } from '../ui/OtpBoxes';

type Props = NativeStackScreenProps<AuthStackParamList, 'TwoFactorChallenge'>;

export function TwoFactorChallengeScreen({ navigation, route }: Props) {
  const { challengeToken } = route.params;
  const { completeTwoFactorLogin } = useAuth();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const otpReady = useBackupCode
    ? value.trim().length > 0
    : value.replace(/\D/g, '').length === OTP_LENGTH;

  const onSubmit = async () => {
    if (!otpReady || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await completeTwoFactorLogin(
        challengeToken,
        useBackupCode
          ? { backupCode: value.trim() }
          : { code: value.replace(/\D/g, '') },
      );
    } catch {
      // API message + SES loader handled globally.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <AuthBackButton onPress={() => navigation.navigate('Login')} />
      <BrandMark />
      <Text style={authStyles.title}>Two-Factor Verification</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        {useBackupCode
          ? 'Enter one of your backup codes.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </Text>
      {useBackupCode ? (
        <TextInput
          style={authStyles.input}
          placeholder="Backup code"
          placeholderTextColor="#8b8f97"
          autoCapitalize="none"
          value={value}
          onChangeText={setValue}
        />
      ) : (
        <OtpBoxes
          value={value}
          onChange={setValue}
          disabled={isSubmitting}
        />
      )}
      <Pressable
        style={[
          authStyles.button,
          (isSubmitting || !otpReady) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !otpReady}
        onPress={onSubmit}
      >
        <ButtonLabel icon="log-in">
          {isSubmitting ? 'Verifying…' : 'Verify'}
        </ButtonLabel>
      </Pressable>
      <Text
        style={authStyles.link}
        onPress={() => {
          setUseBackupCode((v) => !v);
          setValue('');
        }}
      >
        {useBackupCode
          ? 'Use your authenticator code instead'
          : 'Use a backup code instead'}
      </Text>
    </FormScreen>
  );
}
