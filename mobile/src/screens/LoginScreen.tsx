import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';
import { AuthStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';
import { FormScreen } from './FormScreen';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert(
        'Login failed',
        err?.response?.data?.message ?? 'Check your email and password.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <Text style={sharedStyles.title}>Team Coach</Text>
      <TextInput
        style={sharedStyles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={sharedStyles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable
        style={[
          sharedStyles.button,
          (isSubmitting || !email || !password) && sharedStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !email || !password}
        onPress={onSubmit}
      >
        <Text style={sharedStyles.buttonText}>Log In</Text>
      </Pressable>
      <GoogleSignInButton />
      <Text style={sharedStyles.link} onPress={() => navigation.navigate('Signup')}>
        New here? Create an account
      </Text>
    </FormScreen>
  );
}
