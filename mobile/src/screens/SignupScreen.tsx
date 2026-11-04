import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { AuthBackButton } from '../ui/AuthBackButton';
import { ButtonLabel } from '../ui/ButtonLabel';
import { PasswordField } from '../ui/PasswordField';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

// Mirrors the backend's PASSWORD_REGEX (auth/password.util.ts) for fast
// client-side feedback — the server is still the source of truth.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function SignupScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    Boolean(name.trim()) &&
    Boolean(email.trim()) &&
    PASSWORD_REGEX.test(password) &&
    passwordsMatch;

  const onSubmit = async () => {
    if (!PASSWORD_REGEX.test(password)) {
      emitToast(
        'Password needs 8+ chars with upper, lower, number, and special character.',
      );
      return;
    }
    if (!passwordsMatch) {
      emitToast('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await signup(email.trim(), password, name.trim());
      if (result && 'requiresEmailVerification' in result) {
        navigation.navigate('EmailVerification', {
          challengeToken: result.challengeToken,
        });
      }
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
      <Text style={authStyles.title}>Sign up</Text>
      <TextInput
        style={authStyles.input}
        placeholder="Full name"
        placeholderTextColor="#8b8f97"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={authStyles.input}
        placeholder="Email"
        placeholderTextColor="#8b8f97"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <PasswordField value={password} onChangeText={setPassword} />
      <PasswordField
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm password"
      />
      <Text style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 12 }}>
        At least 8 characters, with an uppercase letter, a lowercase letter, a
        number, and a special character.
      </Text>
      {confirmPassword.length > 0 && !passwordsMatch ? (
        <Text style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>
          Passwords do not match.
        </Text>
      ) : null}
      <SoftPressable
        style={[
          authStyles.button,
          (isSubmitting || !canSubmit) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !canSubmit}
        onPress={onSubmit}
        pressScale={0.98}
      >
        <ButtonLabel icon="person-add">Sign Up</ButtonLabel>
      </SoftPressable>
      <GoogleSignInButton />
      <Text style={authStyles.link} onPress={() => navigation.navigate('Login')}>
        Already have an account? Log in
      </Text>
    </FormScreen>
  );
}
