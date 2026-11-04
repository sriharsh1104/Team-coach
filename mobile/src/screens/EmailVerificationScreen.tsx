import React, { useEffect, useState } from 'react';
import { Text, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { AuthBackButton } from '../ui/AuthBackButton';
import { ButtonLabel } from '../ui/ButtonLabel';
import { OtpBoxes, OTP_LENGTH } from '../ui/OtpBoxes';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailVerification'>;

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailVerificationScreen({ navigation, route }: Props) {
  const { challengeToken } = route.params;
  const { completeEmailVerification, resendEmailVerification } = useAuth();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  // Start locked — the signup flow already emailed a code.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const otpReady = code.replace(/\D/g, '').length === OTP_LENGTH;

  const onSubmit = async () => {
    if (!otpReady || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await completeEmailVerification(challengeToken, code.replace(/\D/g, ''));
    } catch {
      // API message + SES loader handled globally.
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    if (isResending || cooldown > 0) return;
    setIsResending(true);
    try {
      await resendEmailVerification(challengeToken);
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      // API message + SES loader handled globally.
    } finally {
      setIsResending(false);
    }
  };

  return (
    <FormScreen>
      <AuthBackButton
        onPress={() => navigation.navigate('Signup')}
        label="Back"
      />
      <BrandMark />
      <Text style={authStyles.title}>Verify Your Email</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        Enter the 6-digit code we emailed you.
      </Text>
      <OtpBoxes
        value={code}
        onChange={setCode}
        disabled={isSubmitting || isResending}
      />
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
        style={[
          authStyles.link,
          (isResending || cooldown > 0) && { opacity: 0.5 },
        ]}
        onPress={isResending || cooldown > 0 ? undefined : onResend}
      >
        {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
      </Text>
    </FormScreen>
  );
}
