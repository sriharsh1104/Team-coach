import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';

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
  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      <Image
        source={sacredLogo}
        style={[styles.image, isAuth ? styles.imageAuth : styles.imageSubtle]}
        resizeMode="contain"
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
  imageSubtle: {
    opacity: 0.12,
  },
  imageAuth: {
    opacity: 0.22,
  },
});
