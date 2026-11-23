import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import * as orgApi from '../api/org';
import { GuildAchievement, GuildDetail } from '../api/types';
import { apiErrorMessage } from '../api/apiErrorMessage';
import { Screen } from '../brand/Screen';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { ThemeColors } from '../theme';
import { SoftPressable } from '../ui/SoftPressable';
import { useSharedStyles } from './shared';
import { GuildAchievementsPanel } from './GuildAchievementsPanel';

/**
 * Guild trophy shelf — grand-final finishes. Everyone in the guild can read;
 * only the org owner sees the add form (server-enforced too).
 */
export function AchievementsScreen() {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(screenStyles);
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await orgApi.getMyGuild();
      setDetail(data);
      setFailed(false);
      setError(null);
    } catch (err: unknown) {
      setDetail(null);
      setFailed(true);
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      setError(
        status === 404
          ? 'Join a guild to see its achievements.'
          : apiErrorMessage(err, 'Could not load achievements'),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const achievements: GuildAchievement[] = detail?.achievements ?? [];
  const canManage = !!detail?.canManageRoster;

  return (
    <Screen>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.chrome}
          />
        }
      >
        <Text style={shared.title}>Achievements</Text>
        <Text style={styles.hint}>
          Grand finals this guild played — standing and points for everyone to
          see.
        </Text>
        {error ? <Text style={shared.error}>{error}</Text> : null}
        {failed ? (
          <SoftPressable
            style={styles.retry}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Try loading again"
          >
            <Text style={styles.retryText}>Could not load. Tap to retry.</Text>
          </SoftPressable>
        ) : detail ? (
          <GuildAchievementsPanel
            achievements={achievements}
            canManage={canManage}
            onChanged={() => void load()}
          />
        ) : (
          <View style={styles.loadingGap} />
        )}
      </ScrollView>
    </Screen>
  );
}

function screenStyles(c: ThemeColors) {
  return {
    list: { flex: 1, backgroundColor: 'transparent' },
    content: { padding: 24, paddingBottom: 40 },
    hint: {
      color: c.textMuted,
      fontSize: 13,
      textAlign: 'center' as const,
      marginTop: -12,
      marginBottom: 20,
    },
    loadingGap: { height: 40 },
    retry: {
      alignItems: 'center' as const,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
    },
    retryText: { color: c.danger, fontSize: 13, fontWeight: '600' as const },
  };
}
