import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FloatingMainTabBar } from '../ui/FloatingMainTabBar';
import { navigationRef } from './navigationRef';
import {
  floatingTabActiveForRoute,
  hideFloatingTabForRoute,
  useFloatingTabChatOpen,
} from './floatingTabVisibility';

type Home = 'OrgHome' | 'GuildHome';

/**
 * Docks the floating tab bar under the main stack so every screen (Health,
 * Announcements, …) keeps the Chat · Games · Go Live · Call strip visible.
 * Hides while a chat conversation is open, or on immersive routes.
 */
export function FloatingTabBarHost({
  home,
  routeName,
  children,
}: {
  home: Home;
  routeName: string | null;
  children: React.ReactNode;
}) {
  const chatOpen = useFloatingTabChatOpen();
  const hide =
    chatOpen || hideFloatingTabForRoute(routeName);

  return (
    <View style={styles.root}>
      <View style={styles.body}>{children}</View>
      {!hide ? (
        <FloatingMainTabBar
          docked
          navigation={navigationRef as any}
          home={home}
          active={floatingTabActiveForRoute(routeName)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});
