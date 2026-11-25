import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RaceAction, RaceEvent, RaceTick, RoomView } from '../../api/games';
import { GameCanvas } from '../../games/three/GameCanvas';
import { RaceScene3D } from '../../games/arcade/RaceScene3D';
import { RaceWorld } from '../../games/arcade/raceWorld';
import {
  arcadeSoundEnabled,
  playArcadeSfx,
  preloadArcadeSfx,
  setArcadeSoundEnabled,
} from '../../games/arcade/arcadeSfx';
import { haptic } from '../../ui/haptics';

/**
 * Road Rash Rush — one rider per phone, all on the same highway.
 *
 * The race itself runs on the server; this screen draws what it is told and
 * sends what its thumbs do. Nothing here decides who crashed into whom, which
 * is the only way four handsets at four different frame rates can agree on a
 * race.
 */

const C = {
  abyss: '#070b14',
  panel: 'rgba(15,23,42,0.88)',
  line: '#1e293b',
  amber: '#f59e0b',
  amberText: '#fbbf24',
  sky: '#38bdf8',
  muted: '#94a3b8',
};

const ARCADE_FONT = Platform.select({
  ios: 'Avenir Next Condensed',
  default: 'sans-serif-condensed',
});

/** What the HUD shows — refreshed on a human timescale, not a GL one. */
type Hud = {
  dots: { seat: number; progress: number; color: string; isHuman: boolean }[];
  hp: number;
  nitro: number;
  kmh: number;
  place: number;
  stalled: boolean;
};

const EMPTY_HUD: Hud = { dots: [], hp: 100, nitro: 100, kmh: 0, place: 1, stalled: false };

function ordinal(place: number): string {
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  return `${place}${suffix}`;
}

export function RaceBoard({
  room,
  meId,
  busy,
  subtitle,
  onLeave,
  onInput,
  onRaceTick,
}: {
  room: RoomView;
  meId: string;
  busy: boolean;
  subtitle?: string;
  onLeave?: () => void;
  onInput: (action: RaceAction) => void;
  /** Subscribes to the 20Hz world; returns the unsubscribe. */
  onRaceTick: (handler: (tick: RaceTick) => void) => () => void;
}) {
  const race = room.race!;
  const mySeat = useMemo(
    () => race.seats.find((s) => s.userId === meId)?.seat ?? -1,
    [race.seats, meId],
  );
  const spectating = mySeat < 0;

  const world = useMemo(() => new RaceWorld(mySeat), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    world.setSeat(mySeat);
  }, [world, mySeat]);

  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [sound, setSound] = useState(arcadeSoundEnabled);
  const [resultSeen, setResultSeen] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    preloadArcadeSfx();
  }, []);

  /** Sound and haptics, on the tick the thing actually happened. */
  const react = useCallback(
    (events: RaceEvent[]) => {
      for (const event of events) {
        switch (event.type) {
          case 'swing':
            playArcadeSfx(event.move);
            if (event.seat === mySeat) haptic('light');
            break;
          case 'hit':
            if (event.seat === mySeat) haptic('medium');
            else if (event.target === mySeat) haptic('warning');
            break;
          case 'wipeout':
            playArcadeSfx('super');
            if (event.seat === mySeat) haptic('error');
            break;
          case 'crash':
            playArcadeSfx('punch');
            if (event.seat === mySeat) haptic('heavy');
            break;
          case 'nitro':
            playArcadeSfx('boost');
            if (event.seat === mySeat) haptic('light');
            break;
          case 'finish':
            if (!finishedRef.current) {
              finishedRef.current = true;
              playArcadeSfx('ko');
              haptic('success');
            }
            break;
        }
      }
    },
    [mySeat],
  );

  useEffect(() => onRaceTick((tick) => react(world.push(tick))), [onRaceTick, react, world]);

  // The HUD reads the same interpolated world the scene draws, just far less
  // often — React has no business running at sixty frames a second.
  useEffect(() => {
    const id = setInterval(() => {
      const view = world.sample();
      if (view.empty) return;
      const order = view.riders
        .map((r, seat) => ({ seat, dist: r.dist }))
        .sort((a, b) => b.dist - a.dist);
      const mine = view.riders[mySeat];
      setHud({
        dots: view.riders.map((r, seat) => ({
          seat,
          progress: Math.min(1, r.dist / race.finishDist),
          color: race.seats[seat]?.color ?? '#94a3b8',
          isHuman: !!race.seats[seat]?.userId,
        })),
        hp: Math.round(mine?.hp ?? 0),
        nitro: Math.round(mine?.nitro ?? 0),
        kmh: Math.round((mine?.speed ?? 0) * 25),
        place: Math.max(1, order.findIndex((o) => o.seat === mySeat) + 1),
        stalled: world.stalled(),
      });
    }, 140);
    return () => clearInterval(id);
  }, [world, mySeat, race.finishDist, race.seats]);

  const fire = (action: RaceAction) => {
    if (busy || spectating) return;
    // Move our own bike now; the next tick confirms or quietly corrects it.
    world.predict(action);
    onInput(action);
    haptic(action === 'nitro' ? 'light' : 'selection');
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setArcadeSoundEnabled(next);
    haptic('selection');
  };

  const winner = race.winnerSeat !== null ? race.seats[race.winnerSeat] : null;
  const showResult = race.phase === 'done' && !resultSeen;

  // The scene is kept out of this component's re-renders: the HUD ticks a few
  // times a second, and rebuilding the GL tree for that would be absurd.
  const arena = useMemo(
    () => (
      <GameCanvas
        style={staticStyles.canvas}
        orthographic
        camera={{ position: [0, 0, 10], near: 0.1, far: 100 }}
        fallback={
          <View style={staticStyles.fallback}>
            <Text style={styles.fallbackText}>
              This race needs 3D graphics, which this device turned down.
            </Text>
          </View>
        }
      >
        <RaceScene3D
          world={world}
          seats={race.seats}
          seed={race.seed}
          finishDist={race.finishDist}
        />
      </GameCanvas>
    ),
    [world, race.seats, race.seed, race.finishDist],
  );

  return (
    <View style={staticStyles.root}>
      {/* ── BRAND BAR ───────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoText}>RR</Text>
          </View>
        </View>
        <View style={staticStyles.flex}>
          <Text style={styles.wordmark}>ROAD RASH RUSH</Text>
          <Text style={styles.wordmarkSub} numberOfLines={1}>
            {subtitle ??
              (spectating
                ? 'Watching'
                : `You are ${race.seats[mySeat]?.tag ?? 'P1'}`)}
          </Text>
        </View>
        <Pressable
          onPress={toggleSound}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={sound ? 'Mute sound' : 'Unmute sound'}
        >
          <Text style={styles.icon}>{sound ? '🔊' : '🔇'}</Text>
        </Pressable>
        {onLeave ? (
          <Pressable
            onPress={onLeave}
            style={styles.leaveBtn}
            accessibilityRole="button"
            accessibilityLabel="Leave the race"
          >
            <Text style={styles.leaveText}>Leave</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── ARENA ───────────────────────────────────────────────────── */}
      <View style={staticStyles.arena}>
        {arena}

        <View style={staticStyles.hud} pointerEvents="none">
          <View style={styles.trackBar}>
            <View style={staticStyles.trackLine} />
            {hud.dots.map((dot) => (
              <View
                key={dot.seat}
                style={[
                  styles.trackDot,
                  {
                    backgroundColor: dot.color,
                    left: `${dot.progress * 100}%`,
                    width: dot.isHuman ? 14 : 10,
                    height: dot.isHuman ? 14 : 10,
                    borderRadius: dot.isHuman ? 7 : 5,
                  },
                ]}
              />
            ))}
          </View>
          <View style={staticStyles.statRow}>
            {!spectating ? (
              <>
                <View style={styles.placeChip}>
                  <Text style={styles.placeText}>{ordinal(hud.place)}</Text>
                </View>
                <View style={styles.statChip}>
                  <Text style={styles.statText}>
                    HP {hud.hp} · {hud.kmh} KM/H · N {hud.nitro}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.statChip}>
                <Text style={styles.statText}>Watching the race</Text>
              </View>
            )}
            {hud.stalled ? (
              <View style={styles.warnChip}>
                <Text style={styles.warnText}>reconnecting…</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* ── YOUR PAD ────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {spectating ? (
          <Text style={styles.spectateNote}>
            You are watching — join the next race to ride.
          </Text>
        ) : (
          <View style={staticStyles.pad}>
            <View style={staticStyles.padGroup}>
              <PadButton label="◀ LEFT" onPress={() => fire('left')} />
              <PadButton label="RIGHT ▶" onPress={() => fire('right')} />
            </View>
            <View style={staticStyles.padGroup}>
              <PadButton label="👊 PUNCH" tone="amber" onPress={() => fire('punch')} />
              <PadButton label="🦵 KICK" tone="rose" onPress={() => fire('kick')} />
              <PadButton label="🔥 NITRO" tone="sky" onPress={() => fire('nitro')} />
            </View>
          </View>
        )}
      </View>

      {/* ── RESULT ──────────────────────────────────────────────────── */}
      <Modal
        visible={showResult}
        transparent
        animationType="fade"
        onRequestClose={() => setResultSeen(true)}
      >
        <View style={staticStyles.scrim}>
          <View style={styles.resultCard}>
            <Text style={staticStyles.resultEmoji}>🏍️</Text>
            <Text style={styles.resultTitle}>
              {race.endReason === 'forfeit'
                ? 'RACE CALLED'
                : `${winner?.name ?? 'NOBODY'} WINS!`}
            </Text>
            <Text style={styles.resultDesc}>
              {race.endReason === 'forfeit'
                ? 'The other riders left the highway.'
                : race.winnerId === meId
                  ? 'Conquered the Curvy Road Rash Highway!'
                  : `${winner?.tag ?? 'They'} took the flag — run it back.`}
            </Text>
            <Pressable
              onPress={() => setResultSeen(true)}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.primaryBtnText}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PadButton({
  label,
  onPress,
  tone = 'slate',
}: {
  label: string;
  onPress: () => void;
  tone?: 'slate' | 'amber' | 'rose' | 'sky';
}) {
  return (
    <Pressable
      // The press *down* is the input: waiting for the release puts the bike
      // a frame behind the thumb.
      onPressIn={onPress}
      style={({ pressed }) => [
        styles.padBtn,
        tone === 'amber' && styles.padAmber,
        tone === 'rose' && styles.padRose,
        tone === 'sky' && styles.padSky,
        pressed && staticStyles.padPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[styles.padText, (tone === 'amber' || tone === 'sky') && styles.padTextDark]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const staticStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.abyss },
  flex: { flex: 1 },
  arena: { flex: 1, overflow: 'hidden' },
  canvas: { flex: 1, borderRadius: 0 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hud: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', gap: 6 },
  trackLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
  },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  pad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  padGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  padPressed: { transform: [{ scale: 0.9 }] },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  resultEmoji: { fontSize: 38 },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  logoOuter: { width: 32, height: 32, borderRadius: 12, padding: 2, backgroundColor: '#f43f5e' },
  logoInner: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 11, fontWeight: '900', color: C.amberText },
  wordmark: {
    fontFamily: ARCADE_FONT,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: C.amberText,
  },
  wordmarkSub: { fontSize: 10, color: C.muted, marginTop: 1 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  icon: { fontSize: 15 },
  leaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  leaveText: { fontSize: 11, fontWeight: '800', color: '#fda4af' },

  trackBar: {
    width: '74%',
    maxWidth: 300,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.panel,
    justifyContent: 'center',
  },
  trackDot: { position: 'absolute', marginLeft: 4, borderWidth: 1, borderColor: '#0f172a' },
  placeChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.9)',
  },
  placeText: {
    fontFamily: ARCADE_FONT,
    fontSize: 11,
    fontWeight: '900',
    color: '#020617',
    letterSpacing: 0.5,
  },
  statChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,23,0.75)',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statText: { fontSize: 10, fontWeight: '700', color: '#e2e8f0' },
  warnChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(76,5,25,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.5)',
  },
  warnText: { fontSize: 10, fontWeight: '700', color: '#fda4af' },
  fallbackText: { fontSize: 13, color: C.muted, textAlign: 'center' },

  controls: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  spectateNote: { fontSize: 12, color: C.muted, textAlign: 'center', paddingVertical: 10 },
  padBtn: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  padAmber: { backgroundColor: C.amber, borderColor: '#fbbf24' },
  padRose: { backgroundColor: '#e11d48', borderColor: '#fb7185' },
  padSky: { backgroundColor: C.sky, borderColor: '#7dd3fc' },
  padText: { fontFamily: ARCADE_FONT, fontSize: 13, fontWeight: '900', color: '#fff' },
  padTextDark: { color: '#020617' },

  resultCard: {
    width: '100%',
    maxWidth: 320,
    padding: 22,
    borderRadius: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,23,42,0.97)',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.6)',
  },
  resultTitle: {
    fontFamily: ARCADE_FONT,
    fontSize: 22,
    fontWeight: '900',
    color: C.amberText,
    textAlign: 'center',
  },
  resultDesc: { fontSize: 12, color: '#cbd5e1', textAlign: 'center', marginBottom: 6 },
  primaryBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: C.amber,
  },
  primaryBtnText: {
    fontFamily: ARCADE_FONT,
    fontSize: 14,
    fontWeight: '900',
    color: '#020617',
    letterSpacing: 1,
  },
});
