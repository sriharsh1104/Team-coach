import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';
import { AuthStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';

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
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Create your account</Text>
      <TextInput
        style={sharedStyles.input}
        placeholder="Full name"
        value={name}
        onChangeText={setName}
      />
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
        placeholder="Password (min 8 characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable
        style={[
          sharedStyles.button,
          (isSubmitting || !canSubmit) && sharedStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !canSubmit}
        onPress={onSubmit}
      >
        <Text style={sharedStyles.buttonText}>Sign Up</Text>
      </Pressable>
      <GoogleSignInButton />
      <Text style={sharedStyles.link} onPress={() => navigation.navigate('Login')}>
        Already have an account? Log in
      </Text>
    </View>
  );
}
