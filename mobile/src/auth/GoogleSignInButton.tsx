import React, { Component, ErrorInfo, ReactNode, Suspense, lazy } from 'react';
import { StyleSheet, View } from 'react-native';

// Lazy so a missing expo-auth-session native peer (crypto/application/browser)
// cannot blank the entire Login screen — email/password still renders.
const GoogleSignInButtonInner = lazy(() =>
  import('./GoogleSignInButtonInner').then((m) => ({
    default: m.GoogleSignInButtonInner,
  })),
);

class GoogleAuthErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Google sign-in unavailable:', error, info.componentStack);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function GoogleSignInButton() {
  return (
    <GoogleAuthErrorBoundary>
      <Suspense fallback={<View style={styles.placeholder} />}>
        <GoogleSignInButtonInner />
      </Suspense>
    </GoogleAuthErrorBoundary>
  );
}

const styles = StyleSheet.create({
  placeholder: { height: 48, marginTop: 12 },
});
