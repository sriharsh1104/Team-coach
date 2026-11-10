import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as authApi from '../api/auth';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { useSharedStyles } from './shared';
import { FormScreen } from './FormScreen';
import { AuthBackButton } from '../ui/AuthBackButton';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      navigation.navigate('ResetPassword', { email: email.trim() });
    } catch {
      // API message is shown by the global axios → toaster interceptor.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <AuthBackButton onPress={() => navigation.navigate('Login')} />
      <BrandMark />
      <Text style={shared.title}>Forgot password</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        Enter your account email and we&apos;ll send you a code to reset your
        password.
      </Text>
      <TextInput
        style={shared.input}
        placeholder="Email"
        placeholderTextColor="#8b8f97"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <SoftPressable
        style={[
          shared.button,
          (isSubmitting || !email.trim()) && shared.buttonDisabled,
        ]}
        disabled={isSubmitting || !email.trim()}
        onPress={onSubmit}
        pressScale={0.98}
      >
        <ButtonLabel icon="send">
          {isSubmitting ? 'Sending…' : 'Send code'}
        </ButtonLabel>
      </SoftPressable>
      <Text style={shared.link} onPress={() => navigation.navigate('Login')}>
        Back to log in
      </Text>
    </FormScreen>
  );
}
