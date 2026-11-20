import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import * as usersApi from '../../api/users';
import { Profile } from '../../api/types';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { SoftPressable } from '../../ui/SoftPressable';
import { useSharedStyles } from '../shared';
import { useTheme } from '../../theme/ThemeContext';

const POLL_MS = 2500;
const GIVE_UP_MS = 3 * 60 * 1000;

type Props = {
  profile: Profile;
  onVerified: (profile: Profile) => void | Promise<void>;
  showToast: (message: string) => void;
};

/**
 * Phone verification through the Team Coach Telegram bot. The bot receives the
 * number from the user's own Telegram account, so nothing is typed and no SMS
 * is sent (free). We open the bot, then poll the profile until the backend
 * marks the phone verified.
 */
export function TelegramPhoneVerify({ profile, onVerified, showToast }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // Latest callbacks without restarting the poll on every parent render.
  const latest = useRef({ onVerified, showToast });
  latest.current = { onVerified, showToast };

  useEffect(() => {
    if (!waiting) return;
    const deadline = Date.now() + GIVE_UP_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (stopped) return;
      if (Date.now() > deadline) {
        setWaiting(false);
        latest.current.showToast(
          'Verification timed out. Tap "Verify on Telegram" to try again.',
        );
        return;
      }
      try {
        const fresh = await usersApi.getMyProfile();
        if (fresh.phoneVerifiedAt) {
          setWaiting(false);
          await latest.current.onVerified(fresh);
          latest.current.showToast('Phone verified on Telegram ✓');
          return;
        }
      } catch {
        // Transient network error — keep polling until the deadline.
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [waiting]);

  const start = async () => {
    setBusy(true);
    try {
      const { deepLink } = await usersApi.startTelegramPhoneVerification();
      await Linking.openURL(deepLink);
      setWaiting(true);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not start Telegram verification.'));
    } finally {
      setBusy(false);
    }
  };

  const note = { color: colors.textMuted };

  if (profile.phoneVerifiedAt) {
    return (
      <Text style={[styles.note, note]}>
        {profile.phone} · verified on Telegram ✓
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.note, note]}>
        {profile.phone
          ? `${profile.phone} is saved but not verified yet.`
          : 'Verify your number with Telegram. It is free and takes one tap — no SMS.'}
      </Text>
      <SoftPressable
        style={[shared.button, (busy || waiting) && shared.buttonDisabled]}
        disabled={busy || waiting}
        onPress={start}
        pressScale={0.98}
      >
        <ButtonLabel icon="phone">
          {waiting ? 'Waiting for Telegram…' : 'Verify on Telegram'}
        </ButtonLabel>
      </SoftPressable>
      {waiting ? (
        <Text style={[styles.note, note]}>
          In Telegram, tap "Share my number". This screen updates on its own.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  note: { fontSize: 13, lineHeight: 18 },
});
