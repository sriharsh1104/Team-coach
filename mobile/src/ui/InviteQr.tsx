import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from './AppIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { SoftPressable } from './SoftPressable';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { ThemeColors } from '../theme';

const sacredLogo = require('../../assets/sacred-logo-transparent.png');

type QrSvgRef = { toDataURL: (cb: (data: string) => void) => void };

function QrPlate({
  value,
  size,
  onRef,
}: {
  value: string;
  size: number;
  onRef?: (c: QrSvgRef | null) => void;
}) {
  const plate = size + 24;
  const logoSize = Math.round(size * 0.34);

  return (
    <View style={[staticStyles.plate, { width: plate, height: plate }]}>
      <Image
        source={sacredLogo}
        style={staticStyles.shadowLogo}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <QRCode
        getRef={onRef}
        value={value}
        size={size}
        backgroundColor="transparent"
        color="rgba(10,10,12,0.88)"
        ecl="H"
        quietZone={0}
        logo={sacredLogo}
        logoSize={logoSize}
        logoMargin={5}
        logoBorderRadius={12}
        logoBackgroundColor="#ffffff"
      />
    </View>
  );
}

/** Branded invite QR — tap opens fullscreen with download + close. */
export function InviteQr({
  value,
  label = 'Scan to join',
  size = 168,
}: {
  value: string;
  label?: string;
  size?: number;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(qrStyles);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qrRef = useRef<QrSvgRef | null>(null);
  const fullQrRef = useRef<QrSvgRef | null>(null);

  async function onDownload() {
    if (busy) return;
    setBusy(true);
    try {
      const ref = (open ? fullQrRef : qrRef).current;
      if (!ref) throw new Error('QR not ready');

      const base64 = await new Promise<string>((resolve, reject) => {
        try {
          ref.toDataURL((data) => resolve(data));
        } catch (err) {
          reject(err);
        }
      });

      await Clipboard.setImageAsync(base64);
      await Share.share({
        message: value,
        title: label,
      });
    } catch {
      Alert.alert('Could not share QR', 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={staticStyles.wrap}>
      <SoftPressable
        style={styles.card}
        onPress={() => setOpen(true)}
        accessibilityLabel="Open QR full screen"
        pressScale={0.98}
      >
        <QrPlate
          value={value}
          size={size}
          onRef={(c) => {
            qrRef.current = c;
          }}
        />
      </SoftPressable>

      <View style={staticStyles.meta}>
        <Text style={styles.label}>{label}</Text>
        <SoftPressable
          style={[staticStyles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={() => void onDownload()}
          accessibilityLabel="Download QR"
          pressScale={0.94}
        >
          <AppIcon name="download-outline" size={18} color={colors.icon} />
        </SoftPressable>
      </View>

      <Modal
        visible={open}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.modalBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={12}
              accessibilityLabel="Back"
              style={staticStyles.modalIconBtn}
            >
              <AppIcon name="chevron-back" size={26} color={colors.text} />
            </Pressable>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {label}
            </Text>
            <View style={staticStyles.modalActions}>
              <Pressable
                style={staticStyles.modalIconBtn}
                onPress={() => void onDownload()}
                accessibilityLabel="Download QR"
              >
                <AppIcon name="download-outline" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setOpen(false)}
                accessibilityLabel="Close"
                hitSlop={10}
              >
                <AppIcon name="close" size={26} color={colors.chromeInk} />
              </Pressable>
            </View>
          </View>

          <View style={staticStyles.modalBody}>
            <View style={styles.modalCard}>
              <QrPlate
                value={value}
                size={260}
                onRef={(c) => {
                  fullQrRef.current = c;
                }}
              />
            </View>
            <Text style={styles.modalHint}>Hold up to scan</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, marginBottom: 14 },
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    // Always white, regardless of app theme — the QR needs a guaranteed
    // light backdrop behind its dark modules to stay scannable.
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  shadowLogo: {
    position: 'absolute',
    width: '96%',
    height: '96%',
    opacity: 0.58,
    tintColor: '#111214',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalIconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function qrStyles(c: ThemeColors) {
  return {
    card: {
      padding: 16,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    label: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '600' as const,
      letterSpacing: 0.3,
    },
    modalRoot: {
      flex: 1,
      backgroundColor: c.bg,
    },
    modalBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      zIndex: 5,
    },
    modalTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '800' as const,
      fontSize: 17,
    },
    modalCloseBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.chrome,
    },
    modalCard: {
      padding: 20,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    modalHint: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '600' as const,
    },
  };
}
