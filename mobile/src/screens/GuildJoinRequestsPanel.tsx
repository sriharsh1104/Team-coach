import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as orgApi from '../api/org';
import type { IncomingGuildJoinRequest } from '../api/org';
import { apiErrorMessage } from '../api/apiErrorMessage';
import { AppIcon } from '../ui/AppIcon';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { haptic } from '../ui/haptics';
import { useOrgRealtimeOptional } from '../realtime/OrgRealtimeProvider';
import { useTheme } from '../theme/ThemeContext';
import { ChannelAvatar } from './chat/ChannelAvatar';

/**
 * Owner / guild leadership inbox for people who asked to join from the public
 * guild list. Accepting seats them; rejecting tells them so they can try
 * elsewhere. Someone who gets in somewhere else first drops off this list on
 * its own (the server supersedes their other requests).
 *
 * Renders nothing for members who cannot decide (403). Leaders always see the
 * section — empty state included — so "where do requests go?" is obvious.
 */
export function GuildJoinRequestsPanel({
  onAccepted,
}: {
  /** Refresh the roster — a new member just appeared. */
  onAccepted?: () => void;
}) {
  const { colors } = useTheme();
  const [requests, setRequests] = useState<IncomingGuildJoinRequest[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await orgApi.listGuildJoinRequests();
      setRequests(res.requests);
      setAllowed(true);
    } catch {
      // 403 for plain members, 404 before a guild exists — hide the section.
      setRequests([]);
      setAllowed(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A new request should land in the inbox while the screen is open, not on
  // the next time it is reopened.
  const realtime = useOrgRealtimeOptional();
  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (event.type === 'members.changed') void load();
    });
  }, [realtime, load]);

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

  if (allowed !== true) return null;

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.head}>
        <AppIcon name="person-add" size={16} color={colors.link} />
        <Text style={[styles.title, { color: colors.text }]}>
          Join requests{requests.length > 0 ? ` (${requests.length})` : ''}
        </Text>
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        People who asked from the public guild list. Approve to seat them, or
        reject so they can try elsewhere.
      </Text>

      {requests.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textDim }]}>
          No pending requests right now.
        </Text>
      ) : null}

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
                  style={[
                    styles.action,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  onPress={() => void decide(request, false)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject ${name}`}
                  pressScale={0.94}
                >
                  <AppIcon name="close" size={22} color={colors.icon} />
                </SoftPressable>
                <SoftPressable
                  style={[
                    styles.action,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.chrome,
                    },
                  ]}
                  onPress={() => void decide(request, true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Accept ${name}`}
                  pressScale={0.94}
                >
                  <AppIcon
                    name="checkmark"
                    size={22}
                    color={colors.chromeInk}
                  />
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
  empty: { fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
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
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
