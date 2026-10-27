import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

// Transparent-bg cutout so the chrome emblem sits on the dark auth
// backdrop without a black square plate (matches the watermark look).
const sacredLogo = require('../../assets/sacred-logo-transparent.png');

/** Compact logo + wordmark for the top of auth screens. */
export function BrandMark() {
  return (
    <View style={styles.wrap}>
      <Image source={sacredLogo} style={styles.logo} resizeMode="contain" />
      <Text style={styles.tagline}>Team Coach</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 148,
    height: 148,
    marginBottom: 6,
  },
  tagline: {
    color: '#9aa0a6',
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
