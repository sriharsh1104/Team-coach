import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const sacredLogo = require('../../assets/sacred-logo-transparent.png');

type Variant = 'subtle' | 'auth';

/**
 * Sacred eSports mark as a faded backdrop. `subtle` is for the whole app
 * shell; `auth` is stronger and centered behind login / signup forms.
 */
export function BrandWatermark({
  variant = 'subtle',
  style,
}: {
  variant?: Variant;
  style?: ViewStyle;
}) {
  const isAuth = variant === 'auth';
  const { colors } = useTheme();
  const opacity = isAuth
    ? Math.min(0.28, colors.watermarkOpacity + 0.1)
    : colors.watermarkOpacity;
  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      <Image
        source={sacredLogo}
        style={[styles.image, { opacity }]}
        resizeMode="contain"
        fadeDuration={0}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '88%',
    maxWidth: 420,
    aspectRatio: 1,
  },
});
