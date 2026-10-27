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

export function SignupScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = name && email && password.length >= 8;

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      await signup(email.trim(), password, name.trim());
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
        placeholder="Password (min 8 characters)"
        placeholderTextColor="#8b8f97"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
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
