import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Screen } from '../../brand/Screen';
import { GAME_CATALOG, GameKind, RoomView } from '../../api/games';
import { useAuth } from '../../auth/AuthContext';
import { useGamesSocket, tryGames } from '../../games/useGamesSocket';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { emitToast } from '../../ui/toastBus';

/**
 * Games hub: pick a game to host a room, or jump into a teammate's open
 * room. Rooms are org-scoped and live only while someone is in them.
 */
export function GamesHubScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(hubStyles);
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [mine, setMine] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [list, current] = await Promise.all([
      tryGames(() => games.listRooms(), 'Could not load games'),
      tryGames(() => games.currentRoom()),
    ]);
    if (list) setRooms(list);
    setMine(current ?? null);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const games = useGamesSocket({
    onRoomsChanged: () => void refresh(),
    onRoom: (room) => {
      if (room.players.some((p) => p.userId === user?.id)) setMine(room);
    },
    onInvite: ({ room, from }) => {
      Alert.alert(
        `${from.name} invited you`,
        `Join their ${room.title} room?`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Join', onPress: () => void join(room.id) },
        ],
      );
    },
  });

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (games.connected) void refresh();
  }, [games.connected, refresh]);

  const openRoom = (room: RoomView) => {
    navigation.navigate('GameRoom', { roomId: room.id, game: room.game });
  };

  const join = async (roomId: string) => {
    setBusy(true);
    const room = await tryGames(() => games.joinRoom(roomId), 'Could not join');
    setBusy(false);
    if (room) openRoom(room);
  };

  const create = async (game: GameKind) => {
    const spec = GAME_CATALOG.find((g) => g.id === game)!;
    const go = async (maxPlayers: number) => {
      setBusy(true);
      const room = await tryGames(() => games.createRoom(game, maxPlayers), 'Could not create room');
      setBusy(false);
      if (room) openRoom(room);
    };
    if (spec.maxPlayers === spec.minPlayers) {
      await go(spec.maxPlayers);
      return;
    }
    Alert.alert('How many players?', 'Teammates join from this screen.', [
      { text: '2', onPress: () => void go(2) },
      { text: '3', onPress: () => void go(3) },
      { text: '4', onPress: () => void go(4) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openRooms = rooms.filter((r) => r.status === 'lobby' && !r.players.some((p) => p.userId === user?.id));

  return (
    <Screen>
      <FlatList
        data={openRooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={staticStyles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.chrome} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.eyebrow}>Play with your team</Text>
            <Text style={styles.title}>Games</Text>

            {mine ? (
              <Pressable style={styles.mineCard} onPress={() => openRoom(mine)} accessibilityRole="button">
                <View style={staticStyles.liveDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mineTitle}>
                    {mine.status === 'playing' ? 'Game in progress' : 'Your room'} · {mine.title}
                  </Text>
                  <Text style={styles.mineSub}>
                    {mine.players.length}/{mine.maxPlayers} players · tap to open
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <View style={staticStyles.cards}>
              {GAME_CATALOG.map((g) => (
                <Pressable
                  key={g.id}
                  style={styles.card}
                  onPress={() => void create(g.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Create ${g.title} room`}
                >
                  <Text style={staticStyles.cardEmoji}>{g.emoji}</Text>
                  <Text style={styles.cardTitle}>{g.title}</Text>
                  <Text style={styles.cardTag}>{g.tagline}</Text>
                  <View style={styles.cardPill}>
                    <Text style={styles.cardPillText}>{g.players}</Text>
                  </View>
                  <Text style={styles.cardCta}>Create room</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.section}>Open rooms</Text>
            {!loading && openRooms.length === 0 ? (
              <Text style={styles.empty}>
                No one is hosting right now. Create a room and your teammates will see it here.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const spec = GAME_CATALOG.find((g) => g.id === item.game);
          const host = item.players.find((p) => p.userId === item.hostId);
          const full = item.players.length >= item.maxPlayers;
          return (
            <View style={styles.room}>
              <Text style={staticStyles.roomEmoji}>{spec?.emoji ?? '🎮'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.roomTitle}>{item.title}</Text>
                <Text style={styles.roomSub}>
                  {host?.name ?? 'Someone'} · {item.players.length}/{item.maxPlayers} players
                </Text>
              </View>
              <Pressable
                style={[styles.joinBtn, (full || busy) && staticStyles.dim]}
                disabled={full || busy}
                onPress={() => void join(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Join ${item.title}`}
              >
                <Text style={styles.joinText}>{full ? 'Full' : 'Join'}</Text>
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          !games.connected && !loading ? (
            <Text style={styles.offline} onPress={() => emitToast('Reconnecting…')}>
              Connecting to games server…
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const staticStyles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  cards: { flexDirection: 'row', gap: 12, marginTop: 14 },
  cardEmoji: { fontSize: 34 },
  roomEmoji: { fontSize: 26, marginRight: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 10 },
  dim: { opacity: 0.5 },
});

function hubStyles(c: ThemeColors) {
  return {
    eyebrow: { color: c.textDim, fontSize: 11, fontWeight: '800' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
    title: { color: c.text, fontSize: 26, fontWeight: '800' as const, marginTop: 2 },
    mineCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.chrome,
    },
    mineTitle: { color: c.text, fontWeight: '700' as const },
    mineSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    card: {
      flex: 1,
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardTitle: { color: c.text, fontWeight: '800' as const, fontSize: 15, marginTop: 8 },
    cardTag: { color: c.textMuted, fontSize: 12, marginTop: 2, minHeight: 32 },
    cardPill: { alignSelf: 'flex-start' as const, marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
    cardPillText: { color: c.textMuted, fontSize: 11, fontWeight: '700' as const },
    cardCta: { color: c.link, fontWeight: '800' as const, marginTop: 12, fontSize: 13 },
    section: { color: c.textMuted, fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginTop: 24, marginBottom: 8 },
    empty: { color: c.textDim, fontSize: 13, lineHeight: 18 },
    room: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    roomTitle: { color: c.text, fontWeight: '700' as const },
    roomSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    joinBtn: { backgroundColor: c.chrome, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
    joinText: { color: c.chromeInk, fontWeight: '800' as const },
    offline: { color: c.textDim, fontSize: 12, textAlign: 'center' as const, marginTop: 16 },
  };
}
