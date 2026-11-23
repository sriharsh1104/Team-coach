import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { haptic } from '../../ui/haptics';

type Row = {
  key: string;
  label: string;
  icon: AppIconName;
  active?: boolean;
  onPress: () => void;
};

/**
 * In-call ⋮ menu — screen share + music share live here so the bottom bar
 * stays to mic / speaker / deafen / leave. Direct 1-on-1 also gets Switch to Video.
 */
export function VoiceMoreSheet({
  visible,
  onClose,
  isScreenSharing,
  musicShareLocal,
  musicShareBusy,
  onToggleScreenShare,
  onMusicPress,
  allowVideoSwitch = false,
  isCameraOn = false,
  onToggleCamera,
}: {
  visible: boolean;
  onClose: () => void;
  isScreenSharing: boolean;
  /** True when *we* are the one sharing music. */
  musicShareLocal: boolean;
  /** True when someone else is already sharing (blocks starting ours). */
  musicShareBusy: boolean;
  onToggleScreenShare: () => void;
  onMusicPress: () => void;
  /** Admin-granted 1-on-1 Direct Voice only. */
  allowVideoSwitch?: boolean;
  isCameraOn?: boolean;
  onToggleCamera?: () => void;
}) {
  const insets = useSafeAreaInsets();

  const rows: Row[] = [];
  if (allowVideoSwitch && onToggleCamera) {
    rows.push({
      key: 'video',
      label: isCameraOn ? 'Turn Off Video' : 'Switch to Video',
      icon: 'videocam-outline',
      active: isCameraOn,
      onPress: () => {
        haptic('light');
        onClose();
        onToggleCamera();
      },
    });
  }
  rows.push(
    {
      key: 'screen',
      label: isScreenSharing ? 'Stop Screen Share' : 'Share Screen',
      icon: 'phone-portrait-outline',
      active: isScreenSharing,
      onPress: () => {
        haptic('light');
        onClose();
        onToggleScreenShare();
      },
    },
    {
      key: 'music',
      label: musicShareLocal
        ? 'Stop Music Share'
        : musicShareBusy
          ? 'Music Share (In Use)'
          : 'Share Music',
      icon: 'musical-notes',
      active: musicShareLocal,
      onPress: () => {
        haptic('light');
        onClose();
        onMusicPress();
      },
    },
  );

  // Keep the menu clear of the bottom mic/speaker/leave bar — sit it in the
  // upper half so those controls stay visible and tappable underneath.
  const topPad = Math.max(insets.top, 12) + 56;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { marginTop: topPad }]}
          onPress={() => undefined}
        >
          <Text style={styles.title}>Call Options</Text>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              style={[styles.row, row.active && styles.rowActive]}
              onPress={row.onPress}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              accessibilityState={{ selected: !!row.active }}
            >
              <AppIcon
                name={row.icon}
                size={20}
                color={row.active ? '#22c55e' : 'rgba(255,255,255,0.8)'}
              />
              <Text style={[styles.rowText, row.active && styles.rowTextActive]}>
                {row.label}
              </Text>
              {row.active ? (
                <AppIcon name="checkmark" size={18} color="#22c55e" />
              ) : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#16171b',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  rowActive: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  rowText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  rowTextActive: {
    color: '#22c55e',
  },
});
