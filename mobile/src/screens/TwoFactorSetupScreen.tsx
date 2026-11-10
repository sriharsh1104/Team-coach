import React, { useState } from 'react';
import {
  Text,
  View,
  Image,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as authApi from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { CopyableField } from './profile/CopyableField';
import { CopyButton } from './profile/CopyButton';
import { ButtonLabel } from '../ui/ButtonLabel';
import { PasswordField } from '../ui/PasswordField';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useSharedStyles } from './shared';

type Props = NativeStackScreenProps<MainStackParamList, 'TwoFactorSetup'>;

export function TwoFactorSetupScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const { refreshUser } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(twoFactorSetupStyles);
  const [password, setPassword] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [secret, setSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [isEnabling, setIsEnabling] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Setup/enable both require re-entering the current password — a stolen
  // access token alone must never be enough to plant 2FA on someone's
  // account (see backend/src/auth/auth.service.ts assertCurrentPassword).
  const onStart = async () => {
    setIsStarting(true);
    try {
      const { secret, qrCodeDataUrl } = await authApi.setupTwoFactor(password.trim());
      setSecret(secret);
      setQrCodeDataUrl(qrCodeDataUrl);
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    } finally {
      setIsStarting(false);
    }
  };

  const onEnable = async () => {
    setIsEnabling(true);
    try {
      const { backupCodes } = await authApi.enableTwoFactor(
        code.trim(),
        password.trim(),
      );
      await refreshUser();
      setBackupCodes(backupCodes);
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    } finally {
      setIsEnabling(false);
    }
  };

  if (!secret) {
    return (
      <Screen>
        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Confirm your password</Text>
          <Text style={styles.hint}>
            Enter your current password to start setting up two-factor
            authentication.
          </Text>
          <PasswordField value={password} onChangeText={setPassword} />
          <Pressable
            style={[
              shared.button,
              (isStarting || !password) && shared.buttonDisabled,
            ]}
            disabled={isStarting || !password}
            onPress={onStart}
          >
            <ButtonLabel icon="check">
              {isStarting ? 'Checking…' : 'Continue'}
            </ButtonLabel>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  if (backupCodes) {
    return (
      <Screen>
        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ padding: 24 }}
        >
          <Text style={styles.title}>Two-Factor Authentication Enabled</Text>
          <Text style={styles.warning}>
            Save these backup codes somewhere safe. Each one can be used once to
            log in if you lose access to your authenticator app — they will
            never be shown again.
          </Text>
          {backupCodes.map((backupCode) => (
            <View key={backupCode} style={styles.backupRow}>
              <Text style={styles.backupCode}>{backupCode}</Text>
              <CopyButton value={backupCode} />
            </View>
          ))}
          <Pressable
            style={shared.button}
            onPress={() => navigation.navigate('AccountSettings')}
          >
            <ButtonLabel icon="check">I've saved these codes</ButtonLabel>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Scan with your authenticator app</Text>
        {qrCodeDataUrl ? (
          <Image source={{ uri: qrCodeDataUrl }} style={staticStyles.qr} />
        ) : null}
        <Text style={styles.hint}>Can't scan? Enter this code manually:</Text>
        <CopyableField label="Secret key" value={secret} />

        <Text style={[styles.hint, { marginTop: 20 }]}>
          Then enter the 6-digit code it shows:
        </Text>
        <TextInput
          style={shared.input}
          placeholder="6-digit code"
          placeholderTextColor={colors.textDim}
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
        <Pressable
          style={[
            shared.button,
            (isEnabling || code.trim().length !== 6) && shared.buttonDisabled,
          ]}
          disabled={isEnabling || code.trim().length !== 6}
          onPress={onEnable}
        >
          <ButtonLabel icon="check">
            {isEnabling ? 'Verifying…' : 'Enable'}
          </ButtonLabel>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  qr: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function twoFactorSetupStyles(c: ThemeColors) {
  return {
    title: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: c.text,
      marginBottom: 16,
      textAlign: 'center' as const,
    },
    hint: { color: c.textMuted, marginBottom: 8 },
    warning: { color: c.textMuted, marginBottom: 16, lineHeight: 20 },
    backupRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backupCode: {
      fontSize: 16,
      fontFamily: 'monospace',
      color: c.text,
    },
  };
}
