import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../theme';
import { setLoaderListener } from './loaderBus';

// Same cutout web uses — black plate already removed (alpha=0).
const sacredLogo = require('../../assets/sacred-logo-transparent.png');

/** Full-screen SES logo pulse — mirrors web `.ses-loader`. */
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
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={styles.overlay} accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Animated.View style={{ transform: [{ scale }], opacity }}>
          <Image source={sacredLogo} style={styles.logo} resizeMode="contain" />
        </Animated.View>
      </View>
    </Modal>
  );
}

/** App-root host: shows while axios (or manual begin/end) is in flight. */
export function LoaderProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setLoaderListener(setVisible);
    return () => setLoaderListener(null);
  }, []);

  return (
    <>
      {children}
      <SesLoader visible={visible} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 220,
    height: 220,
  },
});
