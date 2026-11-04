import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { isAxiosError } from 'axios';
import { useAuth } from './AuthContext';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';
import { AuthStackParamList } from '../navigation/types';

WebBrowser.maybeCompleteAuthSession();

export function GoogleSignInButton() {
  const { loginWithGoogle } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const extra = Constants.expoConfig?.extra ?? {};

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: extra.googleWebClientId as string | undefined,
    androidClientId: extra.googleAndroidClientId as string | undefined,
    iosClientId: extra.googleIosClientId as string | undefined,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      loginWithGoogle(response.params.id_token)
        .then((result) => {
          if (result && 'requiresTwoFactor' in result) {
            navigation.navigate('TwoFactorChallenge', {
              challengeToken: result.challengeToken,
            });
          }
        })
        .catch((err) => {
          // Axios API failures are toasted by the client interceptor.
          if (!isAxiosError(err)) {
            emitToast(apiErrorMessage(err, 'Google sign-in failed'));
          }
        });
    } else if (response?.type === 'error') {
      emitToast('Google sign-in failed. Please try again.');
    }
  }, [response, loginWithGoogle, navigation]);

  const isConfigured = Boolean(extra.googleWebClientId);

  return (
    <SoftPressable
      style={[styles.button, !isConfigured && styles.buttonDisabled]}
      disabled={isConfigured && !request}
      onPress={() => {
        if (!isConfigured) {
          emitToast(
            'Google sign-in is not configured. Add GOOGLE_WEB_CLIENT_ID to your mobile .env.',
          );
          return;
        }
        promptAsync();
      }}
      pressScale={0.98}
    >
      <ButtonLabel icon="google" color="#e8eaed">
        Continue with Google
      </ButtonLabel>
    </SoftPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
