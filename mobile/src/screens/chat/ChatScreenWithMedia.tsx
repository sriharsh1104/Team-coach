import React, { useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatScreen } from './ChatScreen';
import { ChatMediaModal } from './ChatMediaModal';
import { ChatSettingsSheet } from './ChatSettingsSheet';
import { AppIcon } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { useTheme } from '../../theme/ThemeContext';
import { MainStackParamList } from '../../navigation/types';

interface Props {
  channelKey: string;
  title: string;
}

/**
 * Standalone chat route (e.g. Guild Chat) — voice sits next to the composer;
 * media / clear / starred / etc. live under the header ⋮ menu.
 */
export function ChatScreenWithMedia({ channelKey, title }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList, 'Chat'>>();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [chatEpoch, setChatEpoch] = useState(0);
  const { colors: theme } = useTheme();
  const voiceRoute =
    channelKey === 'guild' ? 'GuildVoice' : channelKey === 'org' ? 'Voice' : null;
  const isGroup = channelKey === 'org' || channelKey === 'guild';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <SoftPressable
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Chat settings"
          hitSlop={8}
          pressScale={0.92}
          style={staticStyles.headerBtn}
        >
          <AppIcon name="ellipsis-vertical" size={20} color={theme.icon} />
        </SoftPressable>
      ),
    });
  }, [navigation, theme]);

  return (
    <View style={staticStyles.root}>
      <ChatScreen
        key={`${channelKey}:${starredOnly ? 'starred' : 'all'}:${chatEpoch}`}
        channelKey={channelKey}
        searchActive={searchOpen}
        onCloseSearch={() => setSearchOpen(false)}
        starredOnly={starredOnly}
        onJoinVoice={
          voiceRoute
            ? () => (navigation as any).navigate(voiceRoute)
            : undefined
        }
      />
      <ChatMediaModal
        visible={mediaOpen}
        channelKey={channelKey}
        title={title}
        onClose={() => setMediaOpen(false)}
      />
      <ChatSettingsSheet
        visible={settingsOpen}
        channelKey={channelKey}
        isGroup={isGroup}
        onClose={() => setSettingsOpen(false)}
        onCleared={() => {
          setStarredOnly(false);
          setChatEpoch((n) => n + 1);
        }}
        onStarredFilter={() => {
          setSettingsOpen(false);
          setStarredOnly(true);
        }}
        onSearch={() => setSearchOpen(true)}
        onOpenMedia={() => setMediaOpen(true)}
      />
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  root: { flex: 1, minWidth: 0 },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
