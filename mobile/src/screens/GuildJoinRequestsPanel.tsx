import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as orgApi from '../api/org';
import type { IncomingGuildJoinRequest } from '../api/org';
import { apiErrorMessage } from '../api/apiErrorMessage';
import { AppIcon } from '../ui/AppIcon';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { haptic } from '../ui/haptics';
import { useTheme } from '../theme/ThemeContext';
import { ChannelAvatar } from './chat/ChannelAvatar';

/**
 * Owner / guild leadership inbox for people who asked to join from the public
 * guild list. Accepting seats them; rejecting tells them so they can try
 * elsewhere. Someone who gets in somewhere else first drops off this list on
 * its own (the server supersedes their other requests).
 *
 * Renders nothing at all when the inbox is empty, so it never takes up space
 * on a quiet guild — or for members who cannot decide.
 */
export function GuildJoinRequestsPanel({
  onAccepted,
}: {
  /** Refresh the roster — a new member just appeared. */
  onAccepted?: () => void;
}) {
  const { colors } = useTheme();
  const [requests, setRequests] = useState<IncomingGuildJoinRequest[] | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await orgApi.listGuildJoinRequests();
      setRequests(res.requests);
    } catch {
      // 403 for plain members, 404 before a guild exists — both mean "no
      // inbox here", which is the same as empty.
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (request: IncomingGuildJoinRequest, accept: boolean) => {
    setBusyId(request.id);
    const name = request.inGameName || request.name;
    try {
      await orgApi.decideGuildJoinRequest(request.id, accept);
      haptic(accept ? 'success' : 'light');
      emitToast(accept ? `${name} is in the guild` : `Declined ${name}`);
      setRequests((prev) => (prev ?? []).filter((r) => r.id !== request.id));
      if (accept) onAccepted?.();
    } catch (err) {
      haptic('error');
      emitToast(apiErrorMessage(err, 'Could not update that request'));
      // The server may have superseded it (they joined elsewhere) — re-read
      // rather than leaving a row that no longer exists.
      void load();
    } finally {
      setBusyId(null);
    }
  };

  if (!requests || requests.length === 0) return null;

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.head}>
        <AppIcon name="person-add" size={16} color={colors.link} />
        <Text style={[styles.title, { color: colors.text }]}>
          Join requests ({requests.length})
        </Text>
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        They found this guild in the public list. Nobody gets in until you
        accept.
      </Text>

      {requests.map((request) => {
        const busy = busyId === request.id;
        const name = request.inGameName || request.name;
        return (
          <View key={request.id} style={styles.row}>
            <ChannelAvatar
              uri={request.avatarUrl}
              size={36}
              fallback={(name[0] ?? '?').toUpperCase()}
              previewable={false}
            />
            <View style={styles.rowInfo}>
              <Text
                style={[styles.rowName, { color: colors.text }]}
                numberOfLines={1}
              >
                {name}
              </Text>
              {request.inGameName && request.inGameName !== request.name ? (
                <Text
                  style={[styles.rowSub, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {request.name}
                </Text>
              ) : null}
            </View>

            {busy ? (
              <ActivityIndicator color={colors.link} />
            ) : (
              <View style={styles.actions}>
                <SoftPressable
                  style={[styles.action, styles.reject]}
                  onPress={() => void decide(request, false)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject ${name}`}
                  pressScale={0.94}
                >
                  <AppIcon name="close" size={16} color="#f23f43" />
                </SoftPressable>
                <SoftPressable
                  style={[styles.action, styles.accept]}
                  onPress={() => void decide(request, true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Accept ${name}`}
                  pressScale={0.94}
                >
                  <AppIcon name="checkmark" size={16} color="#0a0a0c" />
                </SoftPressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 12.5, marginTop: 4, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14.5, fontWeight: '700' },
  rowSub: { fontSize: 11.5, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reject: {
    backgroundColor: 'rgba(242,63,67,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(242,63,67,0.4)',
  },
  accept: { backgroundColor: '#22c55e' },
});
