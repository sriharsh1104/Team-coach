import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';

type Props = NativeStackScreenProps<AuthStackParamList, 'TwoFactorChallenge'>;

export function TwoFactorChallengeScreen({ route }: Props) {
  const { challengeToken } = route.params;
  const { completeTwoFactorLogin } = useAuth();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      await completeTwoFactorLogin(
        challengeToken,
        useBackupCode ? { backupCode: value.trim() } : { code: value.trim() },
      );
    } catch (err: any) {
      Alert.alert(
        'Could not verify',
        err?.response?.data?.message ?? 'Check the code and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <BrandMark />
      <Text style={authStyles.title}>Two-Factor Verification</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        {useBackupCode
          ? 'Enter one of your backup codes.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </Text>
      <TextInput
        style={authStyles.input}
        placeholder={useBackupCode ? 'Backup code' : '6-digit code'}
        placeholderTextColor="#8b8f97"
        autoCapitalize="none"
        keyboardType={useBackupCode ? 'default' : 'number-pad'}
        value={value}
        onChangeText={setValue}
      />
      <Pressable
        style={[
          authStyles.button,
          (isSubmitting || !value.trim()) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !value.trim()}
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
        {useBackupCode ? 'Use your authenticator code instead' : 'Use a backup code instead'}
      </Text>
    </FormScreen>
  );
}
