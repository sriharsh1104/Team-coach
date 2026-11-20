import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { SoftPressable } from '../../ui/SoftPressable';
import { useSharedStyles } from '../shared';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  profile: Profile;
  onVerified: (profile: Profile) => void | Promise<void>;
  showToast: (message: string) => void;
};

const digitsOf = (s: string) => s.replace(/\D/g, '');

/**
 * Phone verification through the Team Coach Telegram bot (free, no SMS):
 *   1. the user types their number and taps "Verify on Telegram";
 *   2. Telegram opens — they tap Start, then "Share my number";
 *   3. the bot checks the shared number matches and sends a 6-digit code;
 *   4. they type that code here and the number is verified.
 * Optional: nothing in the app is blocked until this is done.
 */
export function TelegramPhoneVerify({ profile, onVerified, showToast }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [code, setCode] = useState('');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  const note = { color: colors.textMuted };
  const inputExtra = { color: colors.text };

  const reset = () => {
    setDeepLink(null);
    setCode('');
    setChanging(false);
  };

  const openTelegram = async (link: string) => {
    try {
      await Linking.openURL(link);
    } catch {
      showToast('Could not open Telegram. Is it installed?');
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const res = await usersApi.startTelegramPhoneVerification(phone.trim());
      setDeepLink(res.deepLink);
      setCode('');
      await openTelegram(res.deepLink);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not start Telegram verification.'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await usersApi.confirmTelegramPhoneCode(code);
      const fresh = await usersApi.getMyProfile();
      reset();
      await onVerified(fresh);
      showToast('Phone verified ✓');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not verify the code.'));
    } finally {
      setBusy(false);
    }
  };

  if (profile.phoneVerifiedAt && !changing) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.note, note]}>
          {profile.phone} · verified on Telegram ✓
        </Text>
        <SoftPressable
          style={styles.linkBtn}
          onPress={() => {
            setPhone('');
            setChanging(true);
          }}
          pressScale={0.97}
        >
          <Text style={[styles.linkText, { color: colors.link }]}>Change number</Text>
        </SoftPressable>
      </View>
    );
  }

  // Step 2/3: Telegram was opened — waiting for the code.
  if (deepLink) {
    const codeReady = code.length === 6;
    return (
      <View style={styles.wrap}>
        <Text style={[styles.note, note]}>
          In Telegram tap "Start", then "Share my number". The bot will send a
          6-digit code for {phone.trim()}.
        </Text>
        <TextInput
          style={[shared.input, styles.input, inputExtra]}
          value={code}
          onChangeText={(t) => setCode(digitsOf(t).slice(0, 6))}
          placeholder="6-digit code"
          placeholderTextColor={colors.textDim}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          accessibilityLabel="Telegram verification code"
        />
        <SoftPressable
          style={[shared.button, styles.button, (busy || !codeReady) && shared.buttonDisabled]}
          disabled={busy || !codeReady}
          onPress={confirm}
          pressScale={0.98}
        >
          <ButtonLabel icon="check">{busy ? 'Verifying…' : 'Verify code'}</ButtonLabel>
        </SoftPressable>
        <View style={styles.linkRow}>
          <SoftPressable
            style={styles.linkBtn}
            onPress={() => void openTelegram(deepLink)}
            pressScale={0.97}
          >
            <Text style={[styles.linkText, { color: colors.link }]}>Open Telegram again</Text>
          </SoftPressable>
          <SoftPressable style={styles.linkBtn} onPress={reset} pressScale={0.97}>
            <Text style={[styles.linkText, { color: colors.link }]}>Change number</Text>
          </SoftPressable>
        </View>
      </View>
    );
  }

  // Step 1: type the number.
  const phoneReady = digitsOf(phone).length >= 8;
  return (
    <View style={styles.wrap}>
      {profile.phone && !profile.phoneVerifiedAt ? (
        <Text style={[styles.note, note]}>
          {profile.phone} is saved but not verified yet.
        </Text>
      ) : null}
      <TextInput
        style={[shared.input, styles.input, inputExtra]}
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone number, e.g. +91 98765 43210"
        placeholderTextColor={colors.textDim}
        keyboardType="phone-pad"
        maxLength={20}
        autoComplete="tel"
        textContentType="telephoneNumber"
        accessibilityLabel="Phone number"
      />
      <SoftPressable
        style={[shared.button, styles.button, (busy || !phoneReady) && shared.buttonDisabled]}
        disabled={busy || !phoneReady}
        onPress={start}
        pressScale={0.98}
      >
        <ButtonLabel icon="phone">{busy ? 'Opening…' : 'Verify on Telegram'}</ButtonLabel>
      </SoftPressable>
      <Text style={[styles.note, note]}>
        Optional. Free — Telegram sends you a 6-digit code, no SMS.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 4 },
  note: { fontSize: 13, lineHeight: 18 },
  // shared.input/button carry their own margins; the wrapper's gap spaces things.
  input: { marginBottom: 0 },
  button: { marginTop: 0 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  linkBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  linkText: { fontSize: 14, fontWeight: '600' },
});
