import React from 'react';
import { ScrollView } from 'react-native';
import { Screen } from '../brand/Screen';
import { PermissionsSection } from './PermissionsSection';

/**
 * Its own screen, pushed from Account Settings → Security → Manage
 * Permissions — previously bolted onto the bottom of the Security tab,
 * mixed in with password/2FA/biometric settings it has nothing to do with.
 */
export function PermissionsScreen() {
  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <PermissionsSection />
      </ScrollView>
    </Screen>
  );
}
