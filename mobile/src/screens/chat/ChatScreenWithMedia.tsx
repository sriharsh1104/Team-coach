import React, { useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatScreen } from './ChatScreen';
import { ChatMediaModal } from './ChatMediaModal';
import { SoftPressable } from '../../ui/SoftPressable';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { MainStackParamList } from '../../navigation/types';

interface Props {
  channelKey: string;
  title: string;
}

/**
 * Standalone chat route (e.g. Guild Chat, reached directly from a drawer
 * push rather than through ChatHubScreen's embedded inbox view) — Hub
 * supplies its own Media button in its custom header; this one doesn't have
 * a custom header at all, so it was missing the Media gallery entirely.
 * Adds the same button via the native stack header instead.
 */
export function ChatScreenWithMedia({ channelKey, title }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList, 'Chat'>>();
  const [mediaOpen, setMediaOpen] = useState(false);
  const styles = useThemedStyles(mediaBtnStyles);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <SoftPressable
          onPress={() => setMediaOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Chat Media"
          hitSlop={8}
          pressScale={0.95}
        >
          <Text style={styles.mediaBtnText}>Media</Text>
        </SoftPressable>
      ),
    });
  }, [navigation, styles]);

  return (
    <View style={staticStyles.root}>
      {/* Remount when the channel changes so socket + list layout stay clean. */}
      <ChatScreen key={channelKey} channelKey={channelKey} />
      <ChatMediaModal
        visible={mediaOpen}
        channelKey={channelKey}
        title={title}
        onClose={() => setMediaOpen(false)}
      />
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  root: { flex: 1, minWidth: 0 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function mediaBtnStyles(c: ThemeColors) {
  return {
    mediaBtnText: {
      color: c.chrome,
      fontWeight: '700' as const,
      fontSize: 14,
      paddingHorizontal: 12,
    },
  };
}
