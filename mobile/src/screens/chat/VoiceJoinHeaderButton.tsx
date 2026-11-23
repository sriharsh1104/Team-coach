import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { useTheme } from '../../theme/ThemeContext';
import { useVoiceOccupancy } from '../../voice/useVoiceOccupancy';
import type { VoiceRoomKind } from '../../api/voice';
import { ChannelAvatar } from './ChannelAvatar';

type Props = {
  room: VoiceRoomKind;
  /** Required when `room` is `direct` — the other person in the 1-on-1. */
  peerId?: string;
  onPress: () => void;
};

function voiceLabel(
  room: VoiceRoomKind,
  count: number,
): string {
  if (room === 'direct') {
    return count > 0
      ? `1-on-1 voice call, ${count} already in`
      : '1-on-1 voice call';
  }
  if (room === 'guild') {
    return count > 0
      ? `Join guild voice, ${count} already in`
      : 'Join guild voice';
  }
  return count > 0
    ? `Join team voice, ${count} already in`
    : 'Join team voice';
}

/**
 * Headset + live occupancy avatars for the chat header (next to the ⋮ menu).
 * Team/guild rooms and admin-granted 1-on-1 (from a DM) share this control.
 */
export function VoiceJoinHeaderButton({ room, peerId, onPress }: Props) {
  const { colors } = useTheme();
  const { occupancy } = useVoiceOccupancy(room, { peerId });
  const count = occupancy.count;

  return (
    <View style={styles.wrap}>
      {count > 0 ? (
        <View
          style={styles.avatars}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {occupancy.participants.slice(0, 3).map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.avatar,
                {
                  marginLeft: i === 0 ? 0 : -8,
                  zIndex: 3 - i,
                  borderColor: colors.bg,
                },
              ]}
            >
              <ChannelAvatar
                uri={p.avatarUrl}
                size={18}
                fallback={(p.name[0] ?? '?').toUpperCase()}
                previewable={false}
              />
            </View>
          ))}
        </View>
      ) : null}
      <SoftPressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={voiceLabel(room, count)}
        pressScale={0.92}
        style={styles.btn}
      >
        <AppIcon name="headset" size={22} color={count > 0 ? colors.link : colors.icon} />
        {count > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.link }]}>
            <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
          </View>
        ) : null}
      </SoftPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 2,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  btn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
});
