import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { useTheme } from '../../theme/ThemeContext';

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
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <SoftPressable
        onPress={onBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={10}
        pressScale={0.92}
      >
        <AppIcon name="chevron-back" size={26} color={colors.icon} />
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
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[styles.subtitle, { color: colors.textDim }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </SoftPressable>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[styles.subtitle, { color: colors.textDim }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {trailing ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : null}
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
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 2,
  },
  title: {
    fontWeight: '700',
    fontSize: 17,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
});
