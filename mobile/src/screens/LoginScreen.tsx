import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';
import { BrandMark } from '../brand/BrandMark';
import { AuthStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { PasswordField } from '../ui/PasswordField';
import { SoftPressable } from '../ui/SoftPressable';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      if (result && 'requiresTwoFactor' in result) {
        navigation.navigate('TwoFactorChallenge', {
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
      <BrandMark />
      <Text style={authStyles.title}>Log in</Text>
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
      <Text
        style={[authStyles.link, { marginTop: 0, marginBottom: 12 }]}
        onPress={() => navigation.navigate('ForgotPassword')}
      >
        Forgot password?
      </Text>
      <SoftPressable
        style={[
          authStyles.button,
          (isSubmitting || !email || !password) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !email || !password}
        onPress={onSubmit}
        pressScale={0.98}
      >
        <ButtonLabel icon="log-in">Log In</ButtonLabel>
      </SoftPressable>
      <GoogleSignInButton />
      <Text style={authStyles.link} onPress={() => navigation.navigate('Signup')}>
        New here? Create an account
      </Text>
    </FormScreen>
  );
}
