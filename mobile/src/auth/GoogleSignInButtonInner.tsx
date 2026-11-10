import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { isAxiosError } from 'axios';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { useAuth } from './AuthContext';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';
import { AuthStackParamList } from '../navigation/types';

/**
 * Native Google account picker (not a Chrome Custom Tab). Browser-based
 * expo-auth-session often shows a blank accounts.google.com page on Android
 * APKs after Custom URI scheme is enabled.
 */
export function GoogleSignInButtonInner() {
  const { loginWithGoogle } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const extra = Constants.expoConfig?.extra ?? {};
  const webClientId = extra.googleWebClientId as string | undefined;
  const [ready, setReady] = useState(Platform.OS === 'web');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !webClientId) {
      setReady(true);
      return;
    }
    try {
      GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
      });
    } catch (err) {
      console.warn('Google Sign-In configure failed:', err);
    }
    setReady(true);
  }, [webClientId]);

  const applyLogin = async (idToken: string) => {
    const result = await loginWithGoogle(idToken);
    if (result && 'requiresTwoFactor' in result) {
      navigation.navigate('TwoFactorChallenge', {
        challengeToken: result.challengeToken,
      });
    }
  };

  const onPress = async () => {
    if (!webClientId) {
      emitToast(
        'Google sign-in is not configured. Add GOOGLE_WEB_CLIENT_ID to your mobile .env.',
      );
      return;
    }
    if (Platform.OS === 'web') {
      emitToast('Use the website Google button in the browser.');
      return;
    }

    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      // Google Sign-In silently reuses the last account and skips the
      // picker once a session is cached on-device. Signing out first
      // clears that cache so users with multiple Google accounts always
      // get the native chooser to pick which one to log in with.
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;

      const idToken = response.data.idToken;
      if (!idToken) {
        emitToast(
          'Google did not return an ID token. Check GOOGLE_WEB_CLIENT_ID and the Android SHA-1 OAuth client.',
        );
        return;
      }
      await applyLogin(idToken);
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }
      const errText = err instanceof Error ? err.message : String(err ?? '');
      const errCode = isErrorWithCode(err) ? err.code : '';
      // DEVELOPER_ERROR (code 10) = this APK's signing SHA-1 isn't
      // registered for com.teamcoach.app in Google Cloud yet — happens
      // after an Expo/EAS account or keystore change. Not a user error.
      if (
        errCode === 'DEVELOPER_ERROR' ||
        errText.includes('DEVELOPER_ERROR') ||
        errText.includes('Troubleshooting')
      ) {
        emitToast(
          'Google sign-in is not set up for this app build yet. Please use email login for now.',
        );
        console.warn(
          'Google DEVELOPER_ERROR — register the EAS keystore SHA-1 in Google Cloud / Firebase for com.teamcoach.app',
          err,
        );
        return;
      }
      if (!isAxiosError(err)) {
        emitToast(apiErrorMessage(err, 'Google sign-in failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const isConfigured = Boolean(webClientId);

  return (
    <SoftPressable
      style={[
        styles.button,
        (!isConfigured || !ready || busy) && styles.buttonDisabled,
      ]}
      // Keep pressable when misconfigured so we can toast setup help.
      disabled={(isConfigured && !ready) || busy}
      onPress={onPress}
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
