import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as authApi from '../api/auth';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { useSharedStyles } from './shared';
import { FormScreen } from './FormScreen';
import { AuthBackButton } from '../ui/AuthBackButton';
import { ButtonLabel } from '../ui/ButtonLabel';
import { OtpBoxes, OTP_LENGTH } from '../ui/OtpBoxes';
import { PasswordField } from '../ui/PasswordField';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

const RESEND_COOLDOWN_SECONDS = 30;

// Mirrors the backend's PASSWORD_REGEX (auth/password.util.ts) for fast
// client-side feedback — the server is still the source of truth.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function ResetPasswordScreen({ navigation, route }: Props) {
  const shared = useSharedStyles();
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const otpReady = code.replace(/\D/g, '').length === OTP_LENGTH;
  const canSubmit = otpReady && PASSWORD_REGEX.test(newPassword);

  const onSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(email, code.replace(/\D/g, ''), newPassword);
      emitToast('Password reset — sign in with your new password.');
      navigation.navigate('Login');
    } catch {
      // API message is shown by the global axios → toaster interceptor.
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    if (isResending || cooldown > 0) return;
    setIsResending(true);
    try {
      await authApi.forgotPassword(email);
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      // API message is shown by the global axios → toaster interceptor.
    } finally {
      setIsResending(false);
    }
  };

  return (
    <FormScreen>
      <AuthBackButton onPress={() => navigation.navigate('ForgotPassword')} />
      <BrandMark />
      <Text style={shared.title}>Reset password</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        Enter the 6-digit code we emailed to {email} and choose a new password.
      </Text>
      <OtpBoxes
        value={code}
        onChange={setCode}
        disabled={isSubmitting || isResending}
      />
      <PasswordField
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="New password"
      />
      <Text style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 12 }}>
        At least 8 characters, with an uppercase letter, a lowercase letter, a
        number, and a special character.
      </Text>
      <SoftPressable
        style={[
          shared.button,
          (isSubmitting || !canSubmit) && shared.buttonDisabled,
        ]}
        disabled={isSubmitting || !canSubmit}
        onPress={onSubmit}
        pressScale={0.98}
      >
        <ButtonLabel icon="check">
          {isSubmitting ? 'Resetting…' : 'Reset password'}
        </ButtonLabel>
      </SoftPressable>
      <Text
        style={[
          shared.link,
          (isResending || cooldown > 0) && { opacity: 0.5 },
        ]}
        onPress={isResending || cooldown > 0 ? undefined : onResend}
      >
        {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
      </Text>
    </FormScreen>
  );
}
