import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../../brand/Screen';
import { GAME_CATALOG, RoomView, RpsChoice } from '../../api/games';
import { useAuth } from '../../auth/AuthContext';
import { useGamesSocket, tryGames, GameCandidate } from '../../games/useGamesSocket';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { emitToast } from '../../ui/toastBus';
import { AppIcon } from '../../ui/AppIcon';
import { IconActionButton } from '../../ui/IconActionButton';
import { shareGameInvite, ShareTarget } from '../../games/shareGameInvite';
import { BrandShareIcon } from '../../ui/BrandShareIcon';
import { ChannelAvatar } from '../chat/ChannelAvatar';
import { resolveMediaUrl } from '../../api/client';
import { confirmAsync } from '../../ui/confirmAsync';
import { FadeIn } from '../../ui/FadeIn';
import { LudoBoard, ludoColorHex } from './LudoBoard';
import { prefer3DByDefault, supports3D } from '../../games/three/GameCanvas';
import { RpsBoard } from './RpsBoard';

const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * One room, all three phases: lobby (players + invite + start), playing
 * (game board), finished (winner + rematch). State comes from the server on
 * every change — the screen never guesses.
 */
export function GameRoomScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const roomId: string = route.params?.roomId;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(roomStyles);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<GameCandidate[]>([]);
  // userId -> when I last notified them (server enforces 1 per 5 min per pair).
  const [notifiedAt, setNotifiedAt] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  // Android mid-range defaults to 2D (smoother); iOS / strong devices start in 3D.
  const [mode, setMode] = useState<'2d' | '3d'>(() => (prefer3DByDefault() ? '3d' : '2d'));
  const meId = user?.id ?? '';

  const games = useGamesSocket({
    onRoom: (next) => {
      if (next.id !== roomId) return;
      setRoom(next);
    },
  });

  // (Re)join on open: this is also how a reconnect / app resume picks the room back up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await games.joinRoom(roomId);
        if (!cancelled) setRoom(r);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, games.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invite pool comes from the games server: roster players AND guild-only
  // members, so a guild member can invite / be invited too.
  useEffect(() => {
    if (!games.connected) return;
    let cancelled = false;
    games
      .members()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [games.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick while any cooldown is running so the bell re-enables by itself.
  useEffect(() => {
    if (Object.keys(notifiedAt).length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [notifiedAt]);

  const cooldownLeftMs = (userId: string) =>
    Math.max(0, (notifiedAt[userId] ?? 0) + NOTIFY_COOLDOWN_MS - now);

  const notifyAll = () =>
    act(async () => {
      const res = await games.inviteAll(room!.id);
      const at = Date.now();
      setNow(at);
      setNotifiedAt((prev) => {
        const next = { ...prev };
        for (const id of res.sentIds) next[id] = at;
        return next;
      });
      if (res.sentIds.length === 0) {
        emitToast('Everyone was already notified in the last 5 minutes');
      } else {
        const skipped = res.skippedIds.length
          ? ` · ${res.skippedIds.length} already notified recently`
          : '';
        emitToast(`Notified ${res.sentIds.length} teammate${res.sentIds.length === 1 ? '' : 's'}${skipped}`);
      }
    });

  const leave = useCallback(() => {
    const doLeave = async () => {
      await tryGames(() => games.leaveRoom());
      navigation.goBack();
    };
    if (room?.status === 'playing') {
      void confirmAsync(
        'Leave game?',
        'Leaving now counts as a forfeit.',
        'Leave',
        'Stay',
        true,
      ).then((ok) => {
        if (ok) void doLeave();
      });
    } else {
      void doLeave();
    }
  }, [games, navigation, room?.status]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await tryGames(fn);
    setBusy(false);
  };

  if (error) {
    return (
      <Screen>
        <View style={staticStyles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryText}>Back to Games</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }
  if (!room) {
    return (
      <Screen>
        <View style={staticStyles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      </Screen>
    );
  }

  const spec = GAME_CATALOG.find((g) => g.id === room.game);
  const isHost = room.hostId === meId;
  const canStart = isHost && room.players.length >= room.minPlayers;
  const winner = room.players.find((p) => p.userId === (room.rps?.winnerId ?? room.ludo?.winnerId));

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {spec?.emoji} {room.title}
        </Text>
        <Text style={styles.sub}>
          {room.status === 'lobby'
            ? `Waiting for players · ${room.players.length}/${room.maxPlayers}`
            : room.status === 'playing'
              ? 'Live'
              : 'Finished'}
          {!games.connected ? ' · reconnecting…' : ''}
        </Text>
      </View>
      {room.status === 'playing' && supports3D() ? (
        <Pressable
          onPress={() => setMode((m) => (m === '3d' ? '2d' : '3d'))}
          style={styles.modeBtn}
          accessibilityRole="button"
          accessibilityLabel={mode === '3d' ? 'Switch to 2D' : 'Switch to 3D'}
        >
          <Text style={styles.modeText}>{mode === '3d' ? '3D' : '2D'}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={leave} style={styles.leaveBtn} accessibilityRole="button" accessibilityLabel="Leave room">
        <Text style={styles.leaveText}>Leave</Text>
      </Pressable>
    </View>
  );

  if (room.status === 'playing' && room.rps) {
    return (
      <Screen>
        {header}
        <RpsBoard
          room={room}
          meId={meId}
          busy={busy}
          mode={mode}
          onFallback={() => setMode('2d')}
          onPick={(choice: RpsChoice) => void act(() => games.rpsPick(room.id, choice))}
        />
      </Screen>
    );
  }
  if (room.status === 'playing' && room.ludo) {
    return (
      <Screen>
        {header}
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <LudoBoard
            room={room}
            meId={meId}
            busy={busy}
            mode={mode}
            onFallback={() => setMode('2d')}
            onRoll={() => void act(() => games.ludoRoll(room.id))}
            onMove={(i) => void act(() => games.ludoMove(room.id, i))}
          />
        </ScrollView>
      </Screen>
    );
  }

  const shareTo = async (target: ShareTarget) => {
    const result = await shareGameInvite(target, { id: room.id, title: room.title });
    if (result === 'failed') {
      emitToast(
        target === 'copy' ? 'Could not copy the invite' : 'Could not open that app. Try Copy link.',
      );
    } else if (result === 'copied') {
      emitToast(
        target === 'discord'
          ? 'Invite copied — paste it in a Discord chat'
          : 'Invite copied. Paste it anywhere.',
      );
    }
  };

  // Lobby + finished share the player list.
  const invitable = members.filter(
    (m) => m.userId !== meId && !room.players.some((p) => p.userId === m.userId),
  );

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={staticStyles.lobby}>
        {room.status === 'finished' ? (
          <View style={styles.resultCard}>
            <Text style={staticStyles.trophy}>🏆</Text>
            <Text style={styles.resultTitle}>
              {winner ? (winner.userId === meId ? 'You won!' : `${winner.name} won`) : 'Game over'}
            </Text>
            {room.rps ? (
              <Text style={styles.resultSub}>
                {room.rps.scores[room.rps.playerIds[0]]} – {room.rps.scores[room.rps.playerIds[1]]}
              </Text>
            ) : null}
            <Pressable
              style={styles.primaryBtn}
              disabled={busy}
              onPress={() => void act(() => games.rematch(room.id))}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Play again</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.section}>Players</Text>
        {room.players.map((p) => {
          const color = room.ludo?.colors[p.userId];
          const uri = resolveMediaUrl(p.avatarUrl);
          return (
            <FadeIn key={p.userId} animKey={p.userId} duration={160}>
              <View style={styles.playerRow}>
                <View style={color ? { borderRadius: 18, borderWidth: 2, borderColor: ludoColorHex(color) } : undefined}>
                  <ChannelAvatar
                    uri={uri}
                    size={36}
                    fallback={p.name.slice(0, 1).toUpperCase()}
                    previewable={false}
                  />
                </View>
                <Text style={styles.playerName}>
                  {p.name}
                  {p.userId === meId ? ' (You)' : ''}
                </Text>
                {p.userId === room.hostId ? <Text style={styles.hostPill}>HOST</Text> : null}
                {!p.connected ? <Text style={styles.offline}>offline</Text> : null}
              </View>
            </FadeIn>
          );
        })}
        {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }).map((_, i) => (
          <View key={`empty-${i}`} style={[styles.playerRow, staticStyles.emptySeat]}>
            <ChannelAvatar uri={null} size={36} fallback="·" previewable={false} />
            <Text style={styles.emptyText}>Waiting for a player…</Text>
          </View>
        ))}

        {room.status === 'lobby' ? (
          <>
            {isHost ? (
              <Pressable
                style={[styles.primaryBtn, !canStart && staticStyles.dim]}
                disabled={!canStart || busy}
                onPress={() => void act(() => games.startGame(room.id))}
                accessibilityRole="button"
                accessibilityLabel="Start game"
              >
                <Text style={styles.primaryText}>
                  {canStart ? 'Start game' : `Need ${room.minPlayers - room.players.length} more`}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.waitHost}>Waiting for the host to start…</Text>
            )}

            <Text style={styles.section}>Invite</Text>
            <Text style={styles.subSection}>Send a join link</Text>
            <View style={styles.shareRow}>
              {(
                [
                  { target: 'whatsapp', label: 'WhatsApp' },
                  { target: 'discord', label: 'Discord' },
                  { target: 'telegram', label: 'Telegram' },
                ] as const
              ).map(({ target, label }) => (
                <Pressable
                  key={target}
                  style={styles.shareTarget}
                  onPress={() => void shareTo(target)}
                  accessibilityRole="button"
                  accessibilityLabel={`Invite via ${label}`}
                >
                  <BrandShareIcon name={target} />
                  <Text style={styles.shareTargetText}>{label}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.shareTarget}
                onPress={() => void shareTo('copy')}
                accessibilityRole="button"
                accessibilityLabel="Copy invite link"
              >
                <View style={styles.shareGeneric}>
                  <AppIcon name="copy-outline" size={20} color={colors.text} />
                </View>
                <Text style={styles.shareTargetText}>Copy</Text>
              </Pressable>
              <Pressable
                style={styles.shareTarget}
                onPress={() => void shareTo('more')}
                accessibilityRole="button"
                accessibilityLabel="More ways to share the invite"
              >
                <View style={styles.shareGeneric}>
                  <AppIcon name="share-social-outline" size={20} color={colors.text} />
                </View>
                <Text style={styles.shareTargetText}>More</Text>
              </Pressable>
            </View>

            {invitable.length > 0 ? (
              <>
                <Text style={styles.subSection}>Notify a teammate in the app</Text>
                <Pressable
                  style={[styles.shareBtn, busy && staticStyles.dim]}
                  disabled={busy}
                  onPress={() => void notifyAll()}
                  accessibilityRole="button"
                  accessibilityLabel="Notify all teammates"
                >
                  <AppIcon name="notifications" size={18} color={colors.link} />
                  <Text style={styles.shareText}>Notify all teammates</Text>
                </Pressable>
                {invitable.map((m) => {
                  const leftMs = cooldownLeftMs(m.userId);
                  const cooling = leftMs > 0;
                  const mins = Math.ceil(leftMs / 60_000);
                  return (
                    <View key={m.userId} style={styles.playerRow}>
                      <ChannelAvatar
                        uri={resolveMediaUrl(m.avatarUrl)}
                        size={36}
                        fallback={m.name.slice(0, 1).toUpperCase()}
                        previewable={false}
                      />
                      <Text style={styles.playerName}>{m.name}</Text>
                      <IconActionButton
                        icon={cooling ? 'checkmark-circle' : 'notifications'}
                        label={cooling ? `Notified ${m.name}` : `Notify ${m.name}`}
                        tooltip={cooling ? `Notified · again in ${mins} min` : 'Send notification'}
                        disabled={cooling || busy}
                        color={cooling ? undefined : colors.link}
                        onPress={() =>
                          void act(async () => {
                            await games.invite(room.id, m.userId);
                            const at = Date.now();
                            setNow(at);
                            setNotifiedAt((prev) => ({ ...prev, [m.userId]: at }));
                            emitToast(`Notification sent to ${m.name}`);
                          })
                        }
                      />
                    </View>
                  );
                })}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const staticStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  lobby: { padding: 16, paddingBottom: 32 },
  trophy: { fontSize: 40 },
  emptySeat: { opacity: 0.6 },
  dim: { opacity: 0.5 },
});

function roomStyles(c: ThemeColors) {
  return {
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontSize: 18, fontWeight: '800' as const },
    sub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    modeBtn: { marginRight: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    modeText: { color: c.link, fontWeight: '800' as const, fontSize: 12 },
    leaveBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    leaveText: { color: c.danger, fontWeight: '700' as const },
    error: { color: c.danger, textAlign: 'center' as const },
    section: { color: c.textMuted, fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginTop: 18, marginBottom: 8 },
    playerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 8 },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.chrome, alignItems: 'center' as const, justifyContent: 'center' as const },
    avatarEmpty: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' as const },
    avatarText: { color: '#fff', fontWeight: '800' as const },
    playerName: { color: c.text, fontSize: 15, fontWeight: '600' as const, flex: 1 },
    emptyText: { color: c.textDim, fontSize: 13 },
    hostPill: { color: c.chrome, fontSize: 10, fontWeight: '800' as const, letterSpacing: 1 },
    offline: { color: c.textDim, fontSize: 11 },
    primaryBtn: { marginTop: 16, backgroundColor: c.chrome, borderRadius: 12, paddingVertical: 14, alignItems: 'center' as const },
    primaryText: { color: c.chromeInk, fontWeight: '800' as const, fontSize: 15 },
    secondaryBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    secondaryText: { color: c.link, fontWeight: '700' as const },
    waitHost: { color: c.textMuted, textAlign: 'center' as const, marginTop: 16 },
    shareBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    shareText: { color: c.link, fontWeight: '700' as const },
    shareRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14, marginBottom: 6 },
    shareTarget: { alignItems: 'center' as const, gap: 4, width: 56 },
    shareTargetText: { color: c.textMuted, fontSize: 11, fontWeight: '600' as const },
    shareGeneric: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    subSection: { color: c.textDim, fontSize: 12, marginTop: 14, marginBottom: 4 },
    inviteBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    inviteText: { color: c.link, fontWeight: '700' as const },
    resultCard: { alignItems: 'center' as const, padding: 18, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    resultTitle: { color: c.text, fontSize: 20, fontWeight: '800' as const, marginTop: 6 },
    resultSub: { color: c.textMuted, marginTop: 4, fontSize: 16, fontWeight: '700' as const },
  };
}
