import React, { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as orgApi from '../../api/org';
import * as chatApi from '../../api/chat';
import { roleLabel } from '../../api/roles';
import { UserPresence } from '../../api/types';
import { getToken } from '../../storage/tokenStorage';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';
import { SkeletonList } from '../../ui/Skeleton';
import { ChatFlowHeader } from './ChatFlowHeader';
import { ChannelAvatar } from './ChannelAvatar';

type MemberRow = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  roleLabel: string;
  meta: string | null;
};

function formatInGameRoles(roles: string[]): string | null {
  if (roles.length === 0) return null;
  return roles.map(roleLabel).join(', ');
}

/** Group roster / guild sheet used inside ChatHub’s local back stack. */
export function ChatMembersPanel({
  title,
  channelKey,
  onBack,
  onSelectMember,
}: {
  title: string;
  /** `guild` → guild seats (incl. non-roster). Anything else → esports roster. */
  channelKey?: string;
  onBack: () => void;
  onSelectMember: (member: { userId: string; name: string }) => void;
}) {
  const styles = useThemedStyles(membersPanelStyles);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlineByUserId, setOnlineByUserId] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load =
      channelKey === 'guild'
        ? orgApi.getMyGuild().then((guild): MemberRow[] =>
            guild.members.map((m) => ({
              userId: m.userId,
              name: m.name,
              avatarUrl: m.avatarUrl,
              roleLabel: m.onRoster
                ? String(m.rosterRole ?? 'Roster')
                : String(m.guildRole),
              meta: m.onRoster
                ? m.inGameName
                  ? `${m.inGameName} · On roster`
                  : 'On roster'
                : m.inGameName,
            })),
          )
        : orgApi.getMyOrg().then((org): MemberRow[] =>
            org.members.map((m) => ({
              userId: m.userId,
              name: m.name,
              avatarUrl: m.avatarUrl,
              roleLabel: String(m.role),
              meta: formatInGameRoles(m.inGameRoles),
            })),
          );

    load
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load members');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channelKey]);

  useEffect(() => {
    const ids = members.map((m) => m.userId);
    if (ids.length === 0) return;

    let cancelled = false;
    let detachUpdate: (() => void) | null = null;
    let detachConnect: (() => void) | null = null;

    void getToken().then((token) => {
      if (!token || cancelled) return;
      const socket = chatApi.connectChatSocket(token);
      const fetchPresence = () => {
        socket.emit(
          'presence:get',
          { userIds: ids },
          (ack: {
            ok?: boolean;
            presence?: Record<string, UserPresence>;
          }) => {
            if (cancelled || !ack?.ok || !ack.presence) return;
            setOnlineByUserId((prev) => {
              const next = { ...prev };
              for (const [id, p] of Object.entries(ack.presence!)) {
                next[id] = !!p.online;
              }
              return next;
            });
          },
        );
      };
      if (socket.connected) fetchPresence();
      else {
        const onConnect = () => fetchPresence();
        socket.once('connect', onConnect);
        detachConnect = () => socket.off('connect', onConnect);
      }
      const onUpdate = (payload: { userId: string; online: boolean }) => {
        setOnlineByUserId((prev) => ({
          ...prev,
          [payload.userId]: !!payload.online,
        }));
      };
      socket.on('presence:update', onUpdate);
      detachUpdate = () => socket.off('presence:update', onUpdate);
    });

    return () => {
      cancelled = true;
      detachConnect?.();
      detachUpdate?.();
    };
  }, [members]);

  return (
    <View style={styles.root}>
      <ChatFlowHeader
        title={title}
        subtitle={
          isLoading
            ? '…'
            : `${members.length} member${members.length === 1 ? '' : 's'}`
        }
        onBack={onBack}
      />

      {isLoading ? (
        <SkeletonList
          count={8}
          avatarSize={40}
          style={{ paddingHorizontal: 16, paddingTop: 8 }}
        />
      ) : error ? (
        <View style={staticStyles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={staticStyles.list}
          renderItem={({ item, index }) => (
            <SoftPressable
              style={staticStyles.row}
              onPress={() =>
                onSelectMember({ userId: item.userId, name: item.name })
              }
              accessibilityRole="button"
              accessibilityLabel={item.name}
              pressScale={0.985}
              haptic={false}
            >
              <ChannelAvatar
                uri={item.avatarUrl}
                size={36}
                fallback={(item.name[0] ?? '?').toUpperCase()}
                previewable={false}
                online={!!onlineByUserId[item.userId]}
              />
              <View style={staticStyles.rowMain}>
                <Text style={styles.name}>
                  {index + 1}. {item.name}
                </Text>
                {item.meta ? <Text style={styles.meta}>{item.meta}</Text> : null}
              </View>
              <Text style={styles.role}>{item.roleLabel}</Text>
            </SoftPressable>
          )}
        />
      )}
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rowMain: { flex: 1, minWidth: 0 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function membersPanelStyles(c: ThemeColors) {
  return {
    root: { flex: 1, backgroundColor: c.bg },
    error: { color: c.danger, textAlign: 'center' as const },
    name: { color: c.text, fontWeight: '600' as const, fontSize: 16 },
    meta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    role: { color: c.textMuted, fontWeight: '600' as const, fontSize: 12 },
  };
}
