import React, { useState } from 'react';
import { Linking, ScrollView, Text, View, TextInput } from 'react-native';
import { Screen } from '../brand/Screen';
import { useAuth } from '../auth/AuthContext';
import * as usersApi from '../api/users';
import { LEGAL_URLS } from '../legal/urls';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';
import { ButtonLabel } from '../ui/ButtonLabel';
import { PasswordField } from '../ui/PasswordField';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';

type Mode = 'idle' | 'deactivate' | 'delete';

/** Deactivate / delete forms — used as Account Settings tab and standalone. */
export function AccountLifecyclePanel({ embedded = false }: { embedded?: boolean }) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(lifecycleStyles);
  const [mode, setMode] = useState<Mode>('idle');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const hasPassword = !!user?.hasPassword;
  const canSubmit =
    confirmEmail.trim().length > 3 &&
    (!hasPassword || password.trim().length >= 8);

  const resetForm = () => {
    setConfirmEmail('');
    setPassword('');
    setMode('idle');
  };

  const onConfirm = async () => {
    if (!canSubmit || mode === 'idle') return;
    setBusy(true);
    try {
      const body = {
        confirmEmail: confirmEmail.trim(),
        ...(hasPassword ? { password } : {}),
      };
      if (mode === 'deactivate') {
        await usersApi.deactivateMyAccount(body);
        emitToast('Account deactivated');
      } else {
        await usersApi.deleteMyAccount(body);
        emitToast('Account deleted');
      }
      resetForm();
      await logout();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not complete that action'));
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <View>
      {!embedded ? (
        <>
          <Text style={styles.title}>Delete Or Deactivate</Text>
          <Text style={styles.lead}>
            Deactivate pauses your account — sign in again anytime to reactivate.
            Delete removes your account permanently. You can also request
            deletion on the web at sacredesports.com/delete-account.
          </Text>
        </>
      ) : (
        <Text style={styles.lead}>
          Deactivate pauses your account — sign in again anytime to reactivate.
          Delete removes your account permanently. You can also request deletion
          on the web at sacredesports.com/delete-account.
        </Text>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Deactivate Account</Text>
        <Text style={styles.hint}>
          Teammates will not reach you until you sign in again. Your profile
          data stays on the server.
        </Text>
        {mode === 'deactivate' ? (
          <ConfirmForm
            hasPassword={hasPassword}
            confirmEmail={confirmEmail}
            password={password}
            setConfirmEmail={setConfirmEmail}
            setPassword={setPassword}
            busy={busy}
            canSubmit={canSubmit}
            confirmLabel={busy ? 'Deactivating…' : 'Confirm Deactivate'}
            onCancel={resetForm}
            onConfirm={() => void onConfirm()}
            styles={styles}
            colors={colors}
          />
        ) : (
          <SoftPressable
            style={styles.secondaryBtn}
            onPress={() => setMode('deactivate')}
            pressScale={0.98}
          >
            <ButtonLabel icon="logout" color={colors.text}>
              Deactivate Account
            </ButtonLabel>
          </SoftPressable>
        )}
      </View>

      <View style={[styles.card, styles.dangerCard]}>
        <Text style={styles.cardTitle}>Delete Account</Text>
        <Text style={styles.hint}>
          Permanent. If you own a team, transfer ownership or delete the team
          first. This cannot be undone from the app.
        </Text>
        {mode === 'delete' ? (
          <ConfirmForm
            hasPassword={hasPassword}
            confirmEmail={confirmEmail}
            password={password}
            setConfirmEmail={setConfirmEmail}
            setPassword={setPassword}
            busy={busy}
            canSubmit={canSubmit}
            confirmLabel={busy ? 'Deleting…' : 'Confirm Delete'}
            danger
            onCancel={resetForm}
            onConfirm={() => void onConfirm()}
            styles={styles}
            colors={colors}
          />
        ) : (
          <SoftPressable
            style={styles.dangerBtn}
            onPress={() => setMode('delete')}
            pressScale={0.98}
          >
            <ButtonLabel icon="trash" color={colors.danger}>
              Delete Account
            </ButtonLabel>
          </SoftPressable>
        )}
        <SoftPressable
          style={styles.secondaryBtn}
          onPress={() => {
            void Linking.openURL(LEGAL_URLS.deleteAccount).catch(() =>
              emitToast('Could not open web deletion page'),
            );
          }}
          pressScale={0.98}
        >
          <ButtonLabel icon="arrow-forward" color={colors.text}>
            Open Web Deletion Page
          </ButtonLabel>
        </SoftPressable>
      </View>
    </View>
  );
}

export function AccountLifecycleScreen() {
  const styles = useThemedStyles(lifecycleStyles);
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AccountLifecyclePanel />
      </ScrollView>
    </Screen>
  );
}

function ConfirmForm({
  hasPassword,
  confirmEmail,
  password,
  setConfirmEmail,
  setPassword,
  busy,
  canSubmit,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
  styles,
  colors,
}: {
  hasPassword: boolean;
  confirmEmail: string;
  password: string;
  setConfirmEmail: (v: string) => void;
  setPassword: (v: string) => void;
  busy: boolean;
  canSubmit: boolean;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  styles: ReturnType<typeof lifecycleStyles>;
  colors: ThemeColors;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>Type Your Email To Confirm</Text>
      <TextInput
        value={confirmEmail}
        onChangeText={setConfirmEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        placeholder="you@example.com"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      {hasPassword ? (
        <>
          <Text style={styles.fieldLabel}>Password</Text>
          <PasswordField
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
          />
        </>
      ) : (
        <Text style={styles.hint}>
          This Google account has no password — email confirmation is enough.
        </Text>
      )}
      <SoftPressable
        style={[
          danger ? styles.dangerBtn : styles.secondaryBtn,
          (busy || !canSubmit) && styles.btnDisabled,
        ]}
        disabled={busy || !canSubmit}
        onPress={onConfirm}
        pressScale={0.98}
      >
        <ButtonLabel
          icon={danger ? 'trash' : 'logout'}
          color={danger ? colors.danger : colors.text}
        >
          {confirmLabel}
        </ButtonLabel>
      </SoftPressable>
      <SoftPressable style={styles.cancelBtn} onPress={onCancel} pressScale={0.98}>
        <Text style={styles.cancelText}>Cancel</Text>
      </SoftPressable>
    </View>
  );
}

function lifecycleStyles(c: ThemeColors) {
  return {
    content: { padding: 16, paddingBottom: 40 },
    title: {
      color: c.text,
      fontSize: 28,
      fontWeight: '700' as const,
      letterSpacing: -0.4,
      marginBottom: 8,
    },
    lead: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 18,
    },
    card: {
      borderRadius: 16,
      padding: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 14,
    },
    dangerCard: {
      borderColor: 'rgba(248,113,113,0.35)',
    },
    cardTitle: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 17,
      marginBottom: 8,
    },
    hint: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 12,
    },
    fieldLabel: {
      color: c.text,
      fontWeight: '600' as const,
      fontSize: 13,
      marginBottom: 6,
      marginTop: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: c.text,
      fontSize: 15,
      marginBottom: 12,
    },
    secondaryBtn: {
      backgroundColor: c.chrome,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    dangerBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    btnDisabled: { opacity: 0.45 },
    cancelBtn: { alignItems: 'center' as const, paddingVertical: 12 },
    cancelText: { color: c.link, fontWeight: '600' as const, fontSize: 14 },
  };
}
