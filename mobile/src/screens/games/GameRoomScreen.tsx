import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../../brand/Screen';
import * as orgApi from '../../api/org';
import { OrgMember } from '../../api/types';
import { GAME_CATALOG, RoomView, RpsChoice } from '../../api/games';
import { useAuth } from '../../auth/AuthContext';
import { useGamesSocket, tryGames } from '../../games/useGamesSocket';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { emitToast } from '../../ui/toastBus';
import { LudoBoard, ludoColorHex } from './LudoBoard';
import { supports3D } from '../../games/three/GameCanvas';
import { RpsBoard } from './RpsBoard';

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
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invited, setInvited] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<'2d' | '3d'>(() => (supports3D() ? '3d' : '2d'));
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

  useEffect(() => {
    orgApi
      .getMyOrg()
      .then((detail) => setMembers(detail.members))
      .catch(() => {});
  }, []);

  const leave = useCallback(() => {
    const doLeave = async () => {
      await tryGames(() => games.leaveRoom());
      navigation.goBack();
    };
    if (room?.status === 'playing') {
      Alert.alert('Leave game?', 'Leaving now counts as a forfeit.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void doLeave() },
      ]);
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
          return (
            <View key={p.userId} style={styles.playerRow}>
              <View style={[styles.avatar, color ? { backgroundColor: ludoColorHex(color) } : null]}>
                <Text style={styles.avatarText}>{p.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>
                {p.name}
                {p.userId === meId ? ' (You)' : ''}
              </Text>
              {p.userId === room.hostId ? <Text style={styles.hostPill}>HOST</Text> : null}
              {!p.connected ? <Text style={styles.offline}>offline</Text> : null}
            </View>
          );
        })}
        {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }).map((_, i) => (
          <View key={`empty-${i}`} style={[styles.playerRow, staticStyles.emptySeat]}>
            <View style={[styles.avatar, styles.avatarEmpty]} />
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

            {invitable.length > 0 ? (
              <>
                <Text style={styles.section}>Invite teammates</Text>
                {invitable.map((m) => {
                  const sent = invited.has(m.userId);
                  return (
                    <View key={m.userId} style={styles.playerRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{m.name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.playerName}>{m.name}</Text>
                      <Pressable
                        style={[styles.inviteBtn, sent && staticStyles.dim]}
                        disabled={sent || busy}
                        onPress={() =>
                          void act(async () => {
                            await games.invite(room.id, m.userId);
                            setInvited((prev) => new Set(prev).add(m.userId));
                            emitToast(`Invite sent to ${m.name}`);
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Invite ${m.name}`}
                      >
                        <Text style={styles.inviteText}>{sent ? 'Sent' : 'Invite'}</Text>
                      </Pressable>
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
    inviteBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    inviteText: { color: c.link, fontWeight: '700' as const },
    resultCard: { alignItems: 'center' as const, padding: 18, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    resultTitle: { color: c.text, fontSize: 20, fontWeight: '800' as const, marginTop: 6 },
    resultSub: { color: c.textMuted, marginTop: 4, fontSize: 16, fontWeight: '700' as const },
  };
}
