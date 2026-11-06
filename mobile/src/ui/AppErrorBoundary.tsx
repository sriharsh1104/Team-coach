import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

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

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.hint}>
          Restart the app. If this keeps happening, send this message:
        </Text>
        <ScrollView style={styles.box} contentContainerStyle={styles.boxInner}>
          <Text style={styles.message} selectable>
            {error.message}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 16,
  },
  box: {
    maxHeight: 280,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
  },
  boxInner: { padding: 14 },
  message: {
    color: colors.chrome,
    fontSize: 13,
    fontFamily: 'monospace',
  },
});
