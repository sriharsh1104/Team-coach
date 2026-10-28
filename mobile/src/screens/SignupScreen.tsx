import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

// Mirrors the backend's PASSWORD_REGEX (auth/password.util.ts) for fast
// client-side feedback — the server is still the source of truth.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function SignupScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = name && email && PASSWORD_REGEX.test(password);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await signup(email.trim(), password, name.trim());
      if (result && 'requiresEmailVerification' in result) {
        navigation.navigate('EmailVerification', {
          challengeToken: result.challengeToken,
        });
      }
    } catch (err: any) {
      Alert.alert(
        'Signup failed',
        err?.response?.data?.message ?? 'Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <BrandMark />
      <Text style={authStyles.title}>Create Your Account</Text>
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
      <TextInput
        style={authStyles.input}
        placeholder="Password"
        placeholderTextColor="#8b8f97"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Text style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 12 }}>
        At least 8 characters, with an uppercase letter, a lowercase letter, a
        number, and a special character.
      </Text>
      <Pressable
        style={[
          authStyles.button,
          (isSubmitting || !canSubmit) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !canSubmit}
        onPress={onSubmit}
      >
        <ButtonLabel icon="person-add">Sign Up</ButtonLabel>
      </Pressable>
      <GoogleSignInButton />
      <Text style={authStyles.link} onPress={() => navigation.navigate('Login')}>
        Already have an account? Log in
      </Text>
    </FormScreen>
  );
}
