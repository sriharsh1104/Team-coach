import React, { useState } from 'react';
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { MembershipRole } from '../api/types';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';
import { confirmAsync } from '../ui/confirmAsync';

const ROLE_OPTIONS: { value: MembershipRole; label: string }[] = [
  { value: 'PLAYER', label: 'Player' },
  { value: 'COACH', label: 'Coach' },
  { value: 'ANALYST', label: 'Analyst' },
];

function roleLabel(role: MembershipRole | null): string {
  if (!role) return 'Set Role';
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

interface Props {
  // Null for an owner who hasn't chosen a roster seat yet — no pill shows active.
  value: MembershipRole | null;
  onChange: (role: MembershipRole) => void;
  /** Shown in the confirm copy, e.g. member name. */
  memberName?: string;
  /** When false, picking a role applies immediately (e.g. draft before add). */
  confirmBeforeChange?: boolean;
}

/**
 * Compact roster-role control: one chip (current role). Tap opens a themed
 * picker; choosing another role asks for confirm before calling onChange.
 * Avoids always-visible Player/Coach/Analyst pills that eat row space.
 */
export function RoleSelector({
  value,
  onChange,
  memberName,
  confirmBeforeChange = true,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(roleSelectorStyles);
  const [open, setOpen] = useState(false);

  const pick = async (role: MembershipRole) => {
    setOpen(false);
    if (role === value) return;
    if (confirmBeforeChange) {
      const who = memberName?.trim() || 'this member';
      const next = roleLabel(role);
      const confirmed = await confirmAsync(
        'Change Role',
        `Make ${who} a ${next}?`,
        'Change',
        'Cancel',
        false,
      );
      if (!confirmed) return;
    }
    onChange(role);
  };

  return (
    <>
      <SoftPressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        pressScale={0.96}
        accessibilityRole="button"
        accessibilityLabel={`Change role, currently ${roleLabel(value)}`}
      >
        <Text style={styles.triggerText}>{roleLabel(value)}</Text>
        <Text style={styles.chevron}>▾</Text>
      </SoftPressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={staticStyles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              staticStyles.card,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
          >
            <Text style={[staticStyles.title, { color: colors.text }]}>
              Select Role
            </Text>
            <Text style={[staticStyles.message, { color: colors.textMuted }]}>
              {memberName
                ? `Choose a roster role for ${memberName}.`
                : 'Choose a roster role.'}
            </Text>
            <View style={staticStyles.options}>
              {ROLE_OPTIONS.map((option) => {
                const isActive = value === option.value;
                return (
                  <SoftPressable
                    key={option.value}
                    style={[styles.option, isActive && styles.optionActive]}
                    onPress={() => void pick(option.value)}
                    pressScale={0.97}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Select ${option.label}`}
                  >
                    <Text
                      style={
                        isActive ? styles.optionTextActive : styles.optionText
                      }
                    >
                      {option.label}
                    </Text>
                  </SoftPressable>
                );
              })}
            </View>
            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [
                staticStyles.cancelBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
                pressed && staticStyles.btnPressed,
              ]}
              accessibilityLabel="Cancel"
            >
              <Text style={[staticStyles.cancelLabel, { color: colors.text }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 12,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  options: { gap: 8 },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelLabel: { fontSize: 15, fontWeight: '700' },
  btnPressed: { opacity: 0.72 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function roleSelectorStyles(c: ThemeColors) {
  return {
    // Inline on the roster row (right side) — no outer margins that stack height.
    trigger: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: c.surface,
      maxWidth: 110,
    },
    triggerText: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 12,
      flexShrink: 1,
    },
    chevron: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '700' as const,
    },
    option: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: c.surface,
      alignItems: 'center' as const,
    },
    optionActive: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    optionText: { color: c.textMuted, fontWeight: '600' as const, fontSize: 15 },
    optionTextActive: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 15,
    },
  };
}
