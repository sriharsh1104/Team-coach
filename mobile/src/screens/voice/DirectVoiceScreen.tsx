import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as voiceApi from '../../api/voice';
import type { DirectVoicePeer } from '../../api/voice';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../brand/Screen';
import { AppIcon } from '../../ui/AppIcon';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { SoftPressable } from '../../ui/SoftPressable';
import { SkeletonList } from '../../ui/Skeleton';
import { haptic } from '../../ui/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { useSharedStyles } from '../shared';
import { ChannelAvatar } from '../chat/ChannelAvatar';
import { VoiceScreenRoot } from './VoiceChannelScreen';

/**
 * 1-on-1 voice, outside any org or guild.
 *
 * The permission is granted per person by a platform admin, and a call needs
 * it on BOTH sides — so this list only ever contains other people who also
 * have it. Someone without the permission never reaches this screen (the
 * drawer entry is hidden) and would get an empty list even if they did.
 */
export function DirectVoiceScreen() {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [peers, setPeers] = useState<DirectVoicePeer[] | null>(null);
  const [enabled, setEnabled] = useState<boolean>(!!user?.canDirectVoice);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<DirectVoicePeer | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await voiceApi.getDirectVoicePeers();
      setEnabled(res.enabled);
      setPeers(res.peers);
    } catch (err) {
      setPeers([]);
      setError(apiErrorMessage(err, 'Could not load your contacts'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // In a call: hand the whole screen to the shared voice UI, keyed by peer so
  // switching person tears the old session down instead of reusing it.
  if (active) {
    return (
      <View style={styles.root}>
        <View style={[styles.callBar, { borderBottomColor: colors.border }]}>
          <SoftPressable
            onPress={() => setActive(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to contacts"
            pressScale={0.95}
          >
            <AppIcon name="chevron-back" size={22} color={colors.text} />
          </SoftPressable>
          <Text style={[styles.callBarText, { color: colors.textMuted }]}>
            Leave the call before switching person
          </Text>
        </View>
        <VoiceScreenRoot
          key={active.id}
          room="direct"
          peer={{ id: active.id, name: active.name }}
        />
      </View>
    );
  }

  if (!enabled) {
    return (
      <Screen>
        <View style={shared.container}>
          <Text style={shared.error}>
            1-on-1 voice is not enabled for this account.
          </Text>
        </View>
      </Screen>
    );
  }

  if (!peers) {
    return (
      <Screen>
        <View
          style={[
            shared.container,
            { justifyContent: 'flex-start', paddingTop: 24 },
          ]}
        >
          <SkeletonList count={4} avatarSize={40} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={peers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.lead, { color: colors.textMuted }]}>
              Private voice between you and one other person. Only people an
              admin has enabled appear here.
            </Text>
            {error ? <Text style={shared.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Nobody else has 1-on-1 voice yet. It takes two — ask an admin
                to enable it for the person you want to call.
              </Text>
              <SoftPressable
                style={[shared.button, { marginTop: 16 }]}
                onPress={() => void load()}
                pressScale={0.98}
              >
                <ButtonLabel icon="refresh">Refresh</ButtonLabel>
              </SoftPressable>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, { borderColor: colors.border }]}
            onPress={() => {
              haptic('light');
              setActive(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Call ${item.name}`}
          >
            <ChannelAvatar
              uri={item.avatarUrl}
              size={40}
              fallback={(item.name[0] ?? '?').toUpperCase()}
              previewable={false}
            />
            <Text
              style={[styles.rowName, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <View style={styles.callBtn}>
              <AppIcon name="mic" size={18} color="#0a0a0c" />
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  callBarText: { fontSize: 12, flex: 1, minWidth: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },
  header: { paddingTop: 8, paddingBottom: 12, gap: 8 },
  lead: { fontSize: 13, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  rowName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700' },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { paddingTop: 40, paddingHorizontal: 8, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
