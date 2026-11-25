import React, { Component, ReactNode } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { Canvas, CanvasProps } from '@react-three/fiber/native';

/**
 * expo-gl needs a real native GL context: not on web, not in Jest. Screens
 * use this to decide between the 3D scene and their 2D board.
 */
export function supports3D(): boolean {
  if (Platform.OS === 'web') return false;
  if (typeof process !== 'undefined' && process.env?.JEST_WORKER_ID) return false;
  return true;
}

/**
 * Default board mode. Mid/low Android (Redmi etc.) pays a heavy frame cost for
 * GL + antialias; 2D is the butter default and users can flip to 3D in-room.
 */
export function prefer3DByDefault(): boolean {
  if (!supports3D()) return false;
  // iOS generally handles GL fine; Android mid-range often does not.
  return Platform.OS === 'ios';
}

type BoundaryProps = { fallback: ReactNode; children: ReactNode; onError?: () => void };

class SceneErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    console.warn('3D scene failed, falling back to 2D:', err?.message);
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Props = {
  style?: ViewStyle;
  /** Rendered instead of the scene when GL is unavailable or the scene throws. */
  fallback: ReactNode;
  onFallback?: () => void;
  camera?: CanvasProps['camera'];
  children: ReactNode;
};

/**
 * A react-three-fiber Canvas with the two things every game scene needs:
 * a GL-availability check and an error boundary that swaps in the 2D board
 * instead of a blank screen if the device's GL context misbehaves.
 */
export function GameCanvas({ style, fallback, onFallback, camera, children }: Props) {
  if (!supports3D()) return <>{fallback}</>;
  return (
    <View style={[styles.wrap, style]}>
      <SceneErrorBoundary fallback={fallback} onError={onFallback}>
        <Canvas
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          camera={camera}
          // Scenes mark meshes castShadow/receiveShadow, but those flags do
          // nothing unless the renderer has a shadow map at all — without
          // this the pieces looked pasted flat onto the board.
          shadows
          // Antialias is expensive on Mali/Adreno mid-range; drop it on Android.
          gl={{ antialias: Platform.OS === 'ios', powerPreference: 'high-performance' }}
        >
          {children}
        </Canvas>
      </SceneErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', borderRadius: 16 },
});
