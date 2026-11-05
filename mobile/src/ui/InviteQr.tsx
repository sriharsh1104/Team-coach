import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { SoftPressable } from './SoftPressable';
import { colors } from '../theme';

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
    <View style={[styles.plate, { width: plate, height: plate }]}>
      <Image
        source={sacredLogo}
        style={styles.shadowLogo}
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
    <View style={styles.wrap}>
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

      <View style={styles.meta}>
        <Text style={styles.label}>{label}</Text>
        <SoftPressable
          style={styles.iconBtn}
          onPress={() => void onDownload()}
          accessibilityLabel="Download QR"
          pressScale={0.94}
        >
          <Ionicons name="download-outline" size={18} color={colors.text} />
        </SoftPressable>
      </View>

      <Modal
        visible={open}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <View style={styles.modalBar}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {label}
            </Text>
            <View style={styles.modalActions}>
              <SoftPressable
                style={styles.modalIconBtn}
                onPress={() => void onDownload()}
                accessibilityLabel="Download QR"
                pressScale={0.94}
              >
                <Ionicons name="download-outline" size={22} color={colors.text} />
              </SoftPressable>
              <SoftPressable
                style={styles.modalIconBtn}
                onPress={() => setOpen(false)}
                accessibilityLabel="Close"
                pressScale={0.94}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </SoftPressable>
            </View>
          </View>

          <View style={styles.modalBody}>
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

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, marginBottom: 14 },
  card: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(12,12,16,0.95)',
  },
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
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
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#050507',
  },
  modalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: '800',
    fontSize: 17,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalIconBtn: {
    width: 40,
    height: 40,
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
  modalCard: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(12,12,16,0.95)',
  },
  modalHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
