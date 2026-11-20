import React, { useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatScreen } from './ChatScreen';
import { ChatMediaModal } from './ChatMediaModal';
import { AppIcon } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { useTheme } from '../../theme/ThemeContext';
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
  const { colors: theme } = useTheme();
  const voiceRoute =
    channelKey === 'guild' ? 'GuildVoice' : channelKey === 'org' ? 'Voice' : null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={staticStyles.headerActions}>
          {voiceRoute ? (
            <SoftPressable
              onPress={() => (navigation as any).navigate(voiceRoute)}
              accessibilityRole="button"
              accessibilityLabel={
                voiceRoute === 'GuildVoice' ? 'Join guild voice' : 'Join team voice'
              }
              hitSlop={8}
              pressScale={0.92}
              style={staticStyles.headerBtn}
            >
              <AppIcon name="mic-outline" size={22} color={theme.icon} />
            </SoftPressable>
          ) : null}
          <SoftPressable
            onPress={() => setMediaOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Chat Media"
            hitSlop={8}
            pressScale={0.92}
            style={staticStyles.headerBtn}
          >
            <AppIcon name="images-outline" size={22} color={theme.icon} />
          </SoftPressable>
        </View>
      ),
    });
  }, [navigation, theme, voiceRoute]);

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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
