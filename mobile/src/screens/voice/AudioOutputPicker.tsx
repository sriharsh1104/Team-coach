import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../../ui/AppIcon';
import { haptic } from '../../ui/haptics';
import {
  audioOutputIcon,
  audioOutputLabel,
  type AudioOutputId,
} from '../../voice/audioOutputs';
import { useAudioOutput } from '../../voice/useAudioOutput';

/**
 * In-call audio output switch — speaker / phone / headphones / bluetooth,
 * the control every call app has. The button shows the route that is live;
 * tapping opens the list, or flips straight between earpiece and speaker
 * when those are the only two options (the common case with no headphones).
 */
export function AudioOutputPicker({
  enabled,
  style,
}: {
  /** Only true while an AudioSession is running (i.e. in a call). */
  enabled: boolean;
  style?: object;
}) {
  const { outputs, active, select, openSystemPicker } = useAudioOutput(enabled);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Nothing to switch between — don't show a dead button.
  if (outputs.length < 2 && !openSystemPicker) return null;

  const onPress = () => {
    haptic('light');
    // Two routes is a toggle, not a menu. Tapping should just flip it.
    if (outputs.length === 2 && !openSystemPicker) {
      const next = outputs.find((id) => id !== active);
      if (next) select(next);
      return;
    }
    setOpen(true);
  };

  const choose = (id: AudioOutputId) => {
    haptic('light');
    select(id);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        style={style}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          active ? `Audio output: ${audioOutputLabel(active)}` : 'Audio output'
        }
      >
        <AppIcon name={audioOutputIcon(active)} size={22} color="#fff" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Swallow taps on the sheet itself so it doesn't close under them. */}
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
            onPress={() => undefined}
          >
            <View style={styles.grabber} />
            <Text style={styles.title}>Audio output</Text>

            {outputs.map((id) => {
              const isActive = id === active;
              return (
                <Pressable
                  key={id}
                  style={[styles.row, isActive && styles.rowActive]}
                  onPress={() => choose(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <AppIcon
                    name={audioOutputIcon(id)}
                    size={20}
                    color={isActive ? '#22c55e' : 'rgba(255,255,255,0.8)'}
                  />
                  <Text style={[styles.rowText, isActive && styles.rowTextActive]}>
                    {audioOutputLabel(id)}
                  </Text>
                  {isActive && (
                    <AppIcon name="checkmark" size={18} color="#22c55e" />
                  )}
                </Pressable>
              );
            })}

            {openSystemPicker && (
              <Pressable
                style={styles.row}
                onPress={() => {
                  setOpen(false);
                  openSystemPicker();
                }}
                accessibilityRole="button"
              >
                <AppIcon name="bluetooth" size={20} color="rgba(255,255,255,0.8)" />
                <Text style={styles.rowText}>Other devices…</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#16171b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
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
