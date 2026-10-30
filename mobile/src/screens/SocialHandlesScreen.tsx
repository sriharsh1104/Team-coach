import React from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { SoftPressable } from '../ui/SoftPressable';
import { MarqueeText } from '../ui/MarqueeText';
import { CopyButton } from './profile/CopyButton';
import { colors } from '../theme';

const DISCORD_QR = require('../../assets/sacred-discord-qr.jpg');
const INSTAGRAM_QR = require('../../assets/sacred-instagram-qr.jpg');

type Props = NativeStackScreenProps<MainStackParamList, 'SocialHandles'>;

type SocialContact = {
  key: string;
  label: string;
  value: string;
  href?: string;
};

const SOCIAL_CONTACTS: SocialContact[] = [
  {
    key: 'email',
    label: 'Email',
    value: 'sacredesportsss@gmail.com',
    href: 'mailto:sacredesportsss@gmail.com?subject=Sacred%20Esports%20%E2%80%94%20Business%20inquiry',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    value: 'https://www.instagram.com/sacredesportss',
    href: 'https://www.instagram.com/sacredesportss',
  },
  {
    key: 'discord',
    label: 'Discord',
    value: 'https://discord.gg/mUES4kcAE',
    href: 'https://discord.gg/mUES4kcAE',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    value: 'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
    href: 'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    value: '',
    href: '',
  },
];

async function openContact(contact: SocialContact) {
  if (!contact.href?.trim() && !contact.value.trim()) return;
  const url =
    contact.href?.trim() ||
    (contact.value.includes('http')
      ? contact.value
      : contact.key === 'email'
        ? `mailto:${contact.value}`
        : contact.key === 'telegram' && contact.value.startsWith('@')
          ? `https://t.me/${contact.value.slice(1)}`
          : contact.key === 'instagram' && contact.value.startsWith('@')
            ? `https://instagram.com/${contact.value.slice(1)}`
            : null);
  if (!url) return;
  try {
    const can = await Linking.canOpenURL(url);
    if (can) await Linking.openURL(url);
    else Alert.alert('Could not open', contact.value);
  } catch {
    Alert.alert('Could not open', contact.value);
  }
}

export function SocialHandlesScreen(_props: Props) {
  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contactList}>
          {SOCIAL_CONTACTS.map((contact) => {
            const filled = !!contact.value.trim();
            return (
              <View key={contact.key} style={styles.contactRow}>
                <View style={styles.contactMain}>
                  <SoftPressable
                    onPress={() => openContact(contact)}
                    disabled={!filled}
                    accessibilityRole="button"
                    accessibilityLabel={`${contact.label}${filled ? `: ${contact.value}` : ' not set yet'}`}
                    pressScale={0.99}
                  >
                    <Text style={styles.contactLabel}>{contact.label}</Text>
                    <MarqueeText
                      style={
                        filled ? styles.contactValue : styles.contactEmpty
                      }
                      lineHeight={20}
                    >
                      {filled ? contact.value : 'Add your link here'}
                    </MarqueeText>
                  </SoftPressable>
                </View>
                <View style={styles.copySlot}>
                  <CopyButton value={contact.value} />
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.qrCard}>
          <Text style={styles.qrLabel}>Scan to connect</Text>

          <View style={styles.qrGrid}>
            <View style={styles.qrItem}>
              <Text style={styles.qrItemLabel}>Instagram</Text>
              <Text style={styles.qrTitle}>@SACREDESPORTSS</Text>
              <View style={styles.qrFrame}>
                <Image
                  source={INSTAGRAM_QR}
                  style={styles.qrImage}
                  resizeMode="contain"
                  accessibilityLabel="Sacred Esports Instagram QR code"
                />
              </View>
              <Text style={styles.qrLink} numberOfLines={1}>
                instagram.com/sacredesportss
              </Text>
            </View>

            <View style={styles.qrDivider} />

            <View style={styles.qrItem}>
              <Text style={styles.qrItemLabel}>Discord</Text>
              <Text style={styles.qrTitle}>SACRED ESPORTS</Text>
              <View style={styles.qrFrame}>
                <Image
                  source={DISCORD_QR}
                  style={styles.qrImage}
                  resizeMode="contain"
                  accessibilityLabel="Sacred Esports Discord invite QR code"
                />
              </View>
              <Text style={styles.qrLink} numberOfLines={1}>
                discord.gg/mUES4kcAE
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  contactList: { gap: 10 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  contactMain: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    marginRight: 4,
  },
  copySlot: {
    width: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    color: colors.textDim,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  contactValue: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  contactEmpty: {
    color: colors.textDim,
    fontStyle: 'italic',
    fontSize: 13,
  },
  qrCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qrLabel: {
    color: colors.chrome,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  qrGrid: { gap: 18 },
  qrItem: { alignItems: 'center' },
  qrItemLabel: {
    color: colors.textDim,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  qrTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: -0.2,
    marginBottom: 10,
    textAlign: 'center',
  },
  qrDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 2,
  },
  qrFrame: {
    width: 200,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(201,204,209,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  qrLink: {
    marginTop: 10,
    color: colors.link,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
});
