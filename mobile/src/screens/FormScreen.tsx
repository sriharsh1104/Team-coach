import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { BrandWatermark } from '../brand/BrandWatermark';

// Wraps auth / org-setup forms so the keyboard never covers fields, and
// paints the Sacred eSports watermark on a dark chrome-friendly backdrop.
export function FormScreen({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <BrandWatermark variant="auth" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0c' },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
});
