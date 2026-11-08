import React, { useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  Modal,
  Pressable,
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
import {
  openSocialUrl,
  SocialOpenPlatform,
} from '../lib/openSocialUrl';

const DISCORD_QR = require('../../assets/sacred-discord-qr.jpg');
const INSTAGRAM_QR = require('../../assets/sacred-instagram-qr.jpg');

type Props = NativeStackScreenProps<MainStackParamList, 'SocialHandles'>;

type SocialContact = {
  key: SocialOpenPlatform;
  label: string;
  value: string;
  href?: string;
  qr?: {
    title: string;
    source: ImageSourcePropType;
    linkLabel: string;
  };
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
    qr: {
      title: '@SACREDESPORTSS',
      source: INSTAGRAM_QR,
      linkLabel: 'instagram.com/sacredesportss',
    },
  },
  {
    key: 'discord',
    label: 'Discord',
    value: 'https://discord.gg/mUES4kcAE',
    href: 'https://discord.gg/mUES4kcAE',
    qr: {
      title: 'SACRED ESPORTS',
      source: DISCORD_QR,
      linkLabel: 'discord.gg/mUES4kcAE',
    },
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
  await openSocialUrl(url, contact.key);
}

type FullscreenQr = {
  label: string;
  title: string;
  source: ImageSourcePropType;
  href: string;
  linkLabel: string;
  platform: SocialOpenPlatform;
};

export function SocialHandlesScreen(_props: Props) {
  const [fullscreenQr, setFullscreenQr] = useState<FullscreenQr | null>(null);

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
                      autoPlay={filled && contact.value.length > 28}
                    >
                      {filled ? contact.value : 'Add your link here'}
                    </MarqueeText>
                  </SoftPressable>
                </View>
                {contact.qr ? (
                  <SoftPressable
                    onPress={() =>
                      setFullscreenQr({
                        label: contact.label,
                        title: contact.qr!.title,
                        source: contact.qr!.source,
                        href: contact.href || contact.value,
                        linkLabel: contact.qr!.linkLabel,
                        platform: contact.key,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`View ${contact.label} QR full screen`}
                    pressScale={0.94}
                    style={styles.qrChip}
                  >
                    <Image
                      source={contact.qr.source}
                      style={styles.qrChipImage}
                      resizeMode="cover"
                      accessibilityLabel={`${contact.label} QR preview`}
                    />
                  </SoftPressable>
                ) : null}
                <View style={styles.copySlot}>
                  <CopyButton value={contact.value} />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={!!fullscreenQr}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenQr(null)}
      >
        <Pressable
          style={styles.qrModalBackdrop}
          onPress={() => setFullscreenQr(null)}
          accessibilityRole="button"
          accessibilityLabel="Close QR"
        >
          <Pressable style={styles.qrModalSheet} onPress={() => undefined}>
            {fullscreenQr ? (
              <>
                <Text style={styles.qrModalLabel}>{fullscreenQr.label}</Text>
                <Text style={styles.qrModalTitle}>{fullscreenQr.title}</Text>
                <View style={styles.qrModalFrame}>
                  <Image
                    source={fullscreenQr.source}
                    style={styles.qrModalImage}
                    resizeMode="contain"
                    accessibilityLabel={`${fullscreenQr.label} QR full screen`}
                  />
                </View>
                <SoftPressable
                  onPress={() =>
                    openSocialUrl(fullscreenQr.href, fullscreenQr.platform)
                  }
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${fullscreenQr.label}`}
                  pressScale={0.99}
                >
                  <Text style={styles.qrModalLink}>{fullscreenQr.linkLabel}</Text>
                </SoftPressable>
                <SoftPressable
                  onPress={() => setFullscreenQr(null)}
                  style={styles.qrModalClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  pressScale={0.97}
                >
                  <Text style={styles.qrModalCloseText}>Close</Text>
                </SoftPressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
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
    gap: 8,
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
  qrChip: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(201,204,209,0.4)',
    flexShrink: 0,
  },
  qrChipImage: { width: '100%', height: '100%' },
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
  qrModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrModalSheet: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  qrModalLabel: {
    color: colors.textDim,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  qrModalTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  qrModalFrame: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 320,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#fff',
    padding: 16,
  },
  qrModalImage: { width: '100%', height: '100%' },
  qrModalLink: {
    marginTop: 14,
    color: colors.link,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  qrModalClose: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  qrModalCloseText: {
    color: colors.link,
    fontWeight: '700',
    fontSize: 16,
  },
});
