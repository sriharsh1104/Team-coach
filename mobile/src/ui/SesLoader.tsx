import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../theme';
import { setLoaderListener } from './loaderBus';

const sacredLogo = require('../../assets/sacred-logo-transparent.png');

/**
 * Non-Modal overlay — a Modal was remounting the tree under it and felt like
 * a full UI blink on every navigation/API call.
 */
export function SesLoader({ visible }: { visible: boolean }) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    if (!visible) {
      scale.stopAnimation();
      opacity.stopAnimation();
      return;
    }
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.92,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.72,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible, scale, opacity]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="auto"
      style={styles.overlay}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Image source={sacredLogo} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

export function LoaderProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setLoaderListener(setVisible);
    return () => setLoaderListener(null);
  }, []);

  return (
    <View style={styles.host}>
      {children}
      <SesLoader visible={visible} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,12,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  logo: {
    width: 160,
    height: 160,
  },
});
