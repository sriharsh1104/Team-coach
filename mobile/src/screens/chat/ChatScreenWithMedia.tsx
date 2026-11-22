import React, { useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatScreen } from './ChatScreen';
import { ChatMediaModal } from './ChatMediaModal';
import { ChatSettingsSheet } from './ChatSettingsSheet';
import { AppIcon } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { useTheme } from '../../theme/ThemeContext';
import { MainStackParamList } from '../../navigation/types';
import { VoiceJoinHeaderButton } from './VoiceJoinHeaderButton';

interface Props {
  channelKey: string;
  title: string;
}

/**
 * Standalone chat route (e.g. Guild Chat) — voice lives next to the header ⋮;
 * media / clear / starred / etc. live under that menu.
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
  const voiceRoom =
    channelKey === 'guild' ? 'guild' : channelKey === 'org' ? 'team' : null;
  const voiceRoute =
    channelKey === 'guild' ? 'GuildVoice' : channelKey === 'org' ? 'Voice' : null;
  const isGroup = channelKey === 'org' || channelKey === 'guild';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={staticStyles.headerRight}>
          {voiceRoom && voiceRoute ? (
            <VoiceJoinHeaderButton
              room={voiceRoom}
              onPress={() => (navigation as any).navigate(voiceRoute)}
            />
          ) : null}
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
        </View>
      ),
    });
  }, [navigation, theme, voiceRoom, voiceRoute]);

  return (
    <View style={staticStyles.root}>
      {starredOnly ? (
        <View
          style={[
            staticStyles.starredBanner,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <Text style={[staticStyles.starredBannerText, { color: theme.text }]}>
            Starred messages
          </Text>
          <SoftPressable
            onPress={() => setStarredOnly(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Show all messages"
            pressScale={0.95}
          >
            <Text style={[staticStyles.starredBannerAction, { color: theme.link }]}>
              Show all
            </Text>
          </SoftPressable>
        </View>
      ) : null}
      <ChatScreen
        key={`${channelKey}:${starredOnly ? 'starred' : 'all'}:${chatEpoch}`}
        channelKey={channelKey}
        searchActive={searchOpen}
        onCloseSearch={() => setSearchOpen(false)}
        starredOnly={starredOnly}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  starredBannerText: { fontSize: 14, fontWeight: '700' },
  starredBannerAction: { fontSize: 13, fontWeight: '600' },
});
