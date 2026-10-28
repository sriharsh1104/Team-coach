import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  Image,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
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
import { colors } from '../theme';
import { sharedStyles } from './shared';

type Props = NativeStackScreenProps<MainStackParamList, 'TwoFactorSetup'>;

export function TwoFactorSetupScreen({ navigation }: Props) {
  const { refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [isEnabling, setIsEnabling] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    authApi
      .setupTwoFactor()
      .then(({ secret, qrCodeDataUrl }) => {
        setSecret(secret);
        setQrCodeDataUrl(qrCodeDataUrl);
      })
      .catch((err: any) => {
        Alert.alert(
          'Could not start setup',
          err?.response?.data?.message ?? 'Please try again.',
        );
        navigation.goBack();
      })
      .finally(() => setIsLoading(false));
  }, [navigation]);

  const onEnable = async () => {
    setIsEnabling(true);
    try {
      const { backupCodes } = await authApi.enableTwoFactor(code.trim());
      await refreshUser();
      setBackupCodes(backupCodes);
    } catch (err: any) {
      Alert.alert(
        'Could not enable 2FA',
        err?.response?.data?.message ?? 'Check the code and try again.',
      );
    } finally {
      setIsEnabling(false);
    }
  };

  if (isLoading) {
    return (
      <Screen>
        <View style={sharedStyles.container}>
          <ActivityIndicator color={colors.chrome} />
        </View>
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
            style={sharedStyles.button}
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
          <Image source={{ uri: qrCodeDataUrl }} style={styles.qr} />
        ) : null}
        <Text style={styles.hint}>Can't scan? Enter this code manually:</Text>
        <CopyableField label="Secret key" value={secret} />

        <Text style={[styles.hint, { marginTop: 20 }]}>
          Then enter the 6-digit code it shows:
        </Text>
        <TextInput
          style={sharedStyles.input}
          placeholder="6-digit code"
          placeholderTextColor={colors.textDim}
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
        <Pressable
          style={[
            sharedStyles.button,
            (isEnabling || code.trim().length !== 6) && sharedStyles.buttonDisabled,
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

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  qr: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  hint: { color: colors.textMuted, marginBottom: 8 },
  warning: { color: colors.textMuted, marginBottom: 16, lineHeight: 20 },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backupCode: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: colors.text,
  },
});
