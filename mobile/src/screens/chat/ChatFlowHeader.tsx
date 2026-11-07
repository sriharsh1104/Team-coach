import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { SoftPressable } from '../../ui/SoftPressable';

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

/** Shared sub-header for chat inbox → conversation → members → profile. */
export function ChatFlowHeader({
  title,
  subtitle,
  onBack,
  onTitlePress,
  titleAccessibilityLabel,
  leading,
  trailing,
}: Props) {
  return (
    <View style={styles.header}>
      <SoftPressable
        onPress={onBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={10}
        pressScale={0.92}
      >
        <Ionicons name="chevron-back" size={22} color={colors.link} />
      </SoftPressable>

      {leading}

      <View style={styles.titleBlock}>
        {onTitlePress ? (
          <SoftPressable
            onPress={onTitlePress}
            accessibilityRole="button"
            accessibilityLabel={titleAccessibilityLabel ?? title}
            pressScale={0.98}
          >
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </SoftPressable>
        ) : (
          <>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,10,12,0.92)',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
});
