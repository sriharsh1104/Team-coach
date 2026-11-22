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
  onPress: () => void;
};

/**
 * Headset + live occupancy avatars for the chat header (next to the ⋮ menu).
 */
export function VoiceJoinHeaderButton({ room, onPress }: Props) {
  const { colors } = useTheme();
  const { occupancy } = useVoiceOccupancy(room);
  const isGuild = room === 'guild';
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
        accessibilityLabel={
          count > 0
            ? isGuild
              ? `Join guild voice, ${count} already in`
              : `Join team voice, ${count} already in`
            : isGuild
              ? 'Join guild voice'
              : 'Join team voice'
        }
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
