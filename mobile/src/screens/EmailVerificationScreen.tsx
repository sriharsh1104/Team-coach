import React, { useEffect, useState } from 'react';
import { Text, TextInput, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailVerification'>;

const RESEND_COOLDOWN_SECONDS = 30;

export function EmailVerificationScreen({ route }: Props) {
  const { challengeToken } = route.params;
  const { completeEmailVerification, resendEmailVerification } = useAuth();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      await completeEmailVerification(challengeToken, code.trim());
    } catch (err: any) {
      Alert.alert(
        'Could not verify',
        err?.response?.data?.message ?? 'Check the code and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    setIsResending(true);
    try {
      await resendEmailVerification(challengeToken);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      Alert.alert(
        'Could not resend code',
        err?.response?.data?.message ?? 'Please try again.',
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <FormScreen>
      <BrandMark />
      <Text style={authStyles.title}>Verify Your Email</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        Enter the 6-digit code we emailed you.
      </Text>
      <TextInput
        style={authStyles.input}
        placeholder="6-digit code"
        placeholderTextColor="#8b8f97"
        autoCapitalize="none"
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
      />
      <Pressable
        style={[
          authStyles.button,
          (isSubmitting || !code.trim()) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !code.trim()}
        onPress={onSubmit}
      >
        <ButtonLabel icon="log-in">
          {isSubmitting ? 'Verifying…' : 'Verify'}
        </ButtonLabel>
      </Pressable>
      <Text
        style={[authStyles.link, (isResending || cooldown > 0) && { opacity: 0.5 }]}
        onPress={isResending || cooldown > 0 ? undefined : onResend}
      >
        {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
      </Text>
    </FormScreen>
  );
}
