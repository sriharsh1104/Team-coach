import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Function-component shell so the fallback can subscribe to the live theme —
 * a class component can't call hooks itself.
 */
function ErrorFallback({ error }: { error: Error }) {
  const styles = useThemedStyles(boundaryStyles);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.hint}>
        Restart the app. If this keeps happening, send this message:
      </Text>
      <ScrollView style={styles.box} contentContainerStyle={staticStyles.boxInner}>
        <Text style={styles.message} selectable>
          {error.message}
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * Release APKs hide the redbox — a throw during first paint looks like a
 * permanent white/blank screen. Surface the message so the device is usable
 * enough to report what failed.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return <ErrorFallback error={error} />;
  }
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  boxInner: { padding: 14 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function boundaryStyles(c: ThemeColors) {
  return {
    root: {
      flex: 1,
      backgroundColor: c.bg,
      padding: 24,
      justifyContent: 'center' as const,
    },
    box: {
      maxHeight: 280,
      backgroundColor: c.surface,
      borderRadius: 12,
    },
    title: {
      color: c.text,
      fontSize: 20,
      fontWeight: '700' as const,
      marginBottom: 8,
    },
    hint: {
      color: c.textMuted,
      fontSize: 14,
      marginBottom: 16,
    },
    message: {
      color: c.chrome,
      fontSize: 13,
      fontFamily: 'monospace',
    },
  };
}
