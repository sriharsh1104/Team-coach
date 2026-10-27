import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import { ButtonLabel } from '../ui/ButtonLabel';

WebBrowser.maybeCompleteAuthSession();

export function GoogleSignInButton() {
  const { loginWithGoogle } = useAuth();
  const extra = Constants.expoConfig?.extra ?? {};

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: extra.googleWebClientId as string | undefined,
    androidClientId: extra.googleAndroidClientId as string | undefined,
    iosClientId: extra.googleIosClientId as string | undefined,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      loginWithGoogle(response.params.id_token).catch((err) => {
        Alert.alert('Google sign-in failed', err?.message ?? 'Unknown error');
      });
    } else if (response?.type === 'error') {
      Alert.alert('Google sign-in failed', 'Please try again.');
    }
  }, [response, loginWithGoogle]);

  const isConfigured = Boolean(extra.googleWebClientId);

  return (
    <Pressable
      style={[styles.button, !isConfigured && styles.buttonDisabled]}
      disabled={isConfigured && !request}
      onPress={() => {
        if (!isConfigured) {
          Alert.alert(
            'Google sign-in not configured',
            'Add GOOGLE_WEB_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID to your mobile .env file.',
          );
          return;
        }
        promptAsync();
      }}
    >
      <ButtonLabel icon="google" color="#e8eaed">
        Continue with Google
      </ButtonLabel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
