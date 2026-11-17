import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppIcon } from '../../ui/AppIcon';

export type PendingUploadStatus = 'queued' | 'uploading' | 'sending' | 'failed';

type Props = {
  status: PendingUploadStatus;
  /** 0..1 */
  progress: number;
  /** Short caption under the ring, e.g. "Preparing…". */
  label?: string;
};

const RING = 48;
const STROKE = 4;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * WhatsApp-style overlay on a media bubble while the file is still on its
 * way: a progress ring + percentage while uploading, a spinner-ish ring while
 * the message itself is being sent, and a refresh ("try again") icon when
 * either step failed — tap the bubble to resend.
 */
export function PendingMediaOverlay({ status, progress, label }: Props) {
  const pct = Math.max(0, Math.min(1, progress));
  const failed = status === 'failed';
  const dash = failed ? CIRC : CIRC * (1 - pct);

  return (
    <View
      style={styles.overlay}
      pointerEvents="none"
      // Parent bubble Pressable owns the a11y label / tap target.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View style={styles.ringWrap}>
        <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={R}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={STROKE}
            fill="rgba(0,0,0,0.45)"
          />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={R}
            stroke={failed ? '#ef4444' : '#ffffff'}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC}`}
            strokeDashoffset={dash}
            // Start the arc at 12 o'clock.
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          {failed ? (
            <AppIcon name="refresh" size={22} color="#ef4444" />
          ) : (
            <Text style={styles.ringText}>
              {status === 'sending' ? '…' : `${Math.round(pct * 100)}%`}
            </Text>
          )}
        </View>
      </View>
      <Text style={styles.caption} numberOfLines={1}>
        {failed
          ? 'Tap to try again'
          : label ?? (status === 'sending' ? 'Sending…' : 'Uploading…')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 8,
  },
  ringWrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    marginTop: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
});
