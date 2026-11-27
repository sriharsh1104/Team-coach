import React, { useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LEGAL_URLS } from '../legal/urls';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { ChannelAvatar } from './chat/ChannelAvatar';
import {
  THEME_PREFERENCE_OPTIONS,
  ThemeColors,
  ThemePreference,
} from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { AppIcon, AppIconName } from '../ui/AppIcon';
import { SoftPressable } from '../ui/SoftPressable';
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  DateFormatId,
  TimeFormatId,
} from '../datetime/formats';
import { useDateTimeFormat } from '../datetime/DateTimeFormatContext';
import { emitToast } from '../ui/toastBus';

type Props = NativeStackScreenProps<MainStackParamList, 'Settings'>;

type RowProps = {
  icon: AppIconName;
  label: string;
  subtitle?: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
};

function SettingsRow({
  icon,
  label,
  subtitle,
  value,
  onPress,
  last,
}: RowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <SoftPressable
      style={[styles.row, last ? null : styles.rowBorder]}
      onPress={onPress}
      pressScale={0.98}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
        <AppIcon name={icon} size={20} color={colors.icon} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </SoftPressable>
  );
}

function appVersion(): string {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    '1.0.0'
  );
}

/**
 * Unified Settings hub — profile card + Account / Preferences / Support
 * groups. Gear opens this instead of the old dropdown.
 */
export function SettingsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { colors, preference, setTheme } = useTheme();
  const { dateFormat, timeFormat, setDateFormat, setTimeFormat } =
    useDateTimeFormat();
  const styles = useThemedStyles(makeStyles);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);

  const themeLabel =
    THEME_PREFERENCE_OPTIONS.find((o) => o.id === preference)?.label ??
    'Black';
  const dateLabel =
    DATE_FORMAT_OPTIONS.find((o) => o.id === dateFormat)?.label ?? 'DD/MM/YYYY';
  const timeLabel =
    TIME_FORMAT_OPTIONS.find((o) => o.id === timeFormat)?.label ?? '12-Hour';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <ChannelAvatar
            uri={user?.avatarUrl}
            size={64}
            fallback={(user?.name?.trim()?.[0] ?? '?').toUpperCase()}
            previewable={false}
          />
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.name ?? 'Player'}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
          <SoftPressable
            style={styles.editBtn}
            onPress={() => navigation.navigate('Profile', { edit: true })}
            pressScale={0.97}
            accessibilityLabel="Edit Profile"
          >
            <AppIcon name="pencil-outline" size={16} color={colors.chromeInk} />
            <Text style={styles.editBtnText}>Edit</Text>
          </SoftPressable>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="shield-outline"
            label="Account Settings"
            onPress={() => navigation.navigate('AccountSettings')}
          />
          <SettingsRow
            icon="phone-portrait-outline"
            label="Permissions"
            onPress={() => navigation.navigate('Permissions')}
          />
          <SettingsRow
            icon="share-social-outline"
            label="Social Handles"
            onPress={() => navigation.navigate('SocialHandles')}
            last
          />
        </View>

        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="settings-outline"
            label="Theme"
            value={themeLabel}
            onPress={() => setThemePickerOpen(true)}
          />
          <SettingsRow
            icon="alarm-outline"
            label="Date & Time Format"
            value={`${dateLabel} · ${timeLabel}`}
            onPress={() => setDateTimePickerOpen(true)}
            last
          />
        </View>

        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="book-outline"
            label="Help & Support"
            onPress={() => navigation.navigate('HelpSupport')}
          />
          <SettingsRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => {
              void Linking.openURL(LEGAL_URLS.privacy).catch(() =>
                emitToast('Could not open Privacy Policy'),
              );
            }}
          />
          <SettingsRow
            icon="book-outline"
            label="Terms of Service"
            onPress={() => {
              void Linking.openURL(LEGAL_URLS.terms).catch(() =>
                emitToast('Could not open Terms'),
              );
            }}
          />
          <SettingsRow
            icon="trash-outline"
            label="Delete Account (Web)"
            subtitle="Play Store web deletion link"
            onPress={() => {
              void Linking.openURL(LEGAL_URLS.deleteAccount).catch(() =>
                emitToast('Could not open Delete Account page'),
              );
            }}
          />
          <SettingsRow
            icon="information-circle-outline"
            label="About"
            value={`v${appVersion()}`}
            onPress={() => undefined}
            last
          />
        </View>

        <SoftPressable
          style={styles.logoutBtn}
          onPress={() => logout()}
          pressScale={0.97}
          accessibilityLabel="Logout"
        >
          <AppIcon name="log-out" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </SoftPressable>
      </ScrollView>

      <Modal
        visible={themePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setThemePickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setThemePickerOpen(false)}
            accessibilityLabel="Close Theme Picker"
          />
          <View style={styles.modalPanel}>
            <Text style={styles.modalHeading}>Theme</Text>
            {THEME_PREFERENCE_OPTIONS.map((opt) => {
              const active = preference === opt.id;
              return (
                <SoftPressable
                  key={opt.id}
                  style={styles.themeRow}
                  onPress={() => {
                    setTheme(opt.id as ThemePreference);
                    setThemePickerOpen(false);
                  }}
                  pressScale={0.97}
                >
                  <View
                    style={[
                      styles.themeSwatch,
                      {
                        backgroundColor: opt.swatch,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                  <Text style={styles.themeLabel}>{opt.label}</Text>
                  {active ? (
                    <Text style={[styles.themeCheck, { color: colors.link }]}>
                      ✓
                    </Text>
                  ) : null}
                </SoftPressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={dateTimePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDateTimePickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setDateTimePickerOpen(false)}
            accessibilityLabel="Close Date Time Picker"
          />
          <View style={styles.modalPanel}>
            <Text style={styles.modalHeading}>Date Format</Text>
            {DATE_FORMAT_OPTIONS.map((opt) => {
              const active = dateFormat === opt.id;
              return (
                <SoftPressable
                  key={opt.id}
                  style={styles.themeRow}
                  onPress={() => setDateFormat(opt.id as DateFormatId)}
                  pressScale={0.97}
                >
                  <Text style={styles.themeLabel}>{opt.label}</Text>
                  {active ? (
                    <Text style={[styles.themeCheck, { color: colors.link }]}>
                      ✓
                    </Text>
                  ) : null}
                </SoftPressable>
              );
            })}
            <Text style={[styles.modalHeading, { marginTop: 8 }]}>
              Time Format
            </Text>
            {TIME_FORMAT_OPTIONS.map((opt) => {
              const active = timeFormat === opt.id;
              return (
                <SoftPressable
                  key={opt.id}
                  style={styles.themeRow}
                  onPress={() => setTimeFormat(opt.id as TimeFormatId)}
                  pressScale={0.97}
                >
                  <Text style={styles.themeLabel}>{opt.label}</Text>
                  {active ? (
                    <Text style={[styles.themeCheck, { color: colors.link }]}>
                      ✓
                    </Text>
                  ) : null}
                </SoftPressable>
              );
            })}
            <SoftPressable
              style={styles.doneRow}
              onPress={() => setDateTimePickerOpen(false)}
              pressScale={0.97}
            >
              <Text style={[styles.themeLabel, { color: colors.link }]}>
                Done
              </Text>
            </SoftPressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return {
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    profileCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
    },
    profileText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    profileName: {
      color: c.text,
      fontSize: 17,
      fontWeight: '700' as const,
    },
    profileEmail: {
      color: c.textMuted,
      fontSize: 13,
    },
    editBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      backgroundColor: c.chrome,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    editBtnText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 13,
    },
    sectionLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700' as const,
      letterSpacing: 0.6,
      textTransform: 'uppercase' as const,
      marginTop: 18,
      marginBottom: 8,
      marginLeft: 4,
    },
    group: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 14,
      overflow: 'hidden' as const,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowBody: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    rowLabel: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600' as const,
    },
    rowSub: {
      color: c.textDim,
      fontSize: 12,
    },
    rowValue: {
      color: c.textMuted,
      fontSize: 13,
      marginRight: 2,
    },
    chevron: {
      color: c.textDim,
      fontSize: 22,
      fontWeight: '300' as const,
      lineHeight: 24,
    },
    logoutBtn: {
      marginTop: 28,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      paddingVertical: 14,
    },
    logoutText: {
      color: c.danger,
      fontSize: 16,
      fontWeight: '700' as const,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'center' as const,
      padding: 24,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    modalPanel: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
      paddingVertical: 8,
      overflow: 'hidden' as const,
    },
    modalHeading: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700' as const,
      letterSpacing: 0.6,
      textTransform: 'uppercase' as const,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
    },
    themeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    themeSwatch: {
      width: 22,
      height: 22,
      borderRadius: 8,
      borderWidth: 1,
    },
    themeLabel: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600' as const,
      flex: 1,
    },
    themeCheck: {
      fontSize: 15,
      fontWeight: '800' as const,
    },
    doneRow: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center' as const,
    },
  };
}
