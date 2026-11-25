import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../brand/Screen';
import { GameCanvas, supports3D } from '../../games/three/GameCanvas';
import { RaceScene3D } from '../../games/race/RaceScene3D';
import {
  AttackType,
  FINISH_DIST,
  RaceMode,
  RaceState,
  createRaceState,
  humansIn,
  kmh,
  raceAttack,
  raceNitro,
  raceSteer,
  standings,
  takeEvents,
} from '../../games/race/raceEngine';
import { haptic } from '../../ui/haptics';

/**
 * Road Rash Rush — the same-phone arcade racer.
 *
 * This one is deliberately *not* a server room like Chess or UNO: it runs at
 * sixty frames a second with no turns to take, which is a different kind of
 * game entirely. One to four people share the handset, each with their own
 * pad along the bottom, and the CPU rides whatever seats are left.
 */

const C = {
  abyss: '#070b14',
  panel: 'rgba(15,23,42,0.88)',
  line: '#1e293b',
  lineSoft: 'rgba(51,65,85,0.8)',
  amber: '#f59e0b',
  amberText: '#fbbf24',
  sky: '#38bdf8',
  rose: '#f43f5e',
  emerald: '#34d399',
  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
};

const ARCADE_FONT = Platform.select({ ios: 'Avenir Next Condensed', default: 'sans-serif-condensed' });

const MODES: RaceMode[] = ['1p', '2p', '3p', '4p'];
const MODE_LABEL: Record<RaceMode, string> = {
  '1p': '1P CPU',
  '2p': '2P',
  '3p': '3P',
  '4p': '4P',
};

/** Per-seat accents, matching the bike colours the scene paints. */
const SEAT = [
  { name: 'P1', color: '#ef4444', tint: 'rgba(76,5,25,0.35)', edge: 'rgba(239,68,68,0.4)' },
  { name: 'P2', color: '#3b82f6', tint: 'rgba(8,47,73,0.35)', edge: 'rgba(56,189,248,0.4)' },
  { name: 'P3', color: '#22c55e', tint: 'rgba(5,46,22,0.4)', edge: 'rgba(16,185,129,0.4)' },
  { name: 'P4', color: '#a855f7', tint: 'rgba(59,7,100,0.4)', edge: 'rgba(168,85,247,0.4)' },
];

/** What the HUD shows — a snapshot, refreshed about eight times a second. */
type Hud = {
  humans: { id: number; name: string; hp: number; nitro: number; kmh: number; color: string }[];
  dots: { id: number; progress: number; color: string; isHuman: boolean }[];
  place: number;
  finished: boolean;
  winner: string | null;
};

function hudOf(state: RaceState): Hud {
  const order = standings(state);
  const humans = state.bikers.filter((b) => b.isHuman);
  return {
    humans: humans.map((b) => ({
      id: b.id,
      name: b.tag,
      hp: Math.round(b.hp),
      nitro: Math.round(b.nitro),
      kmh: kmh(b),
      color: b.color,
    })),
    dots: state.bikers.map((b) => ({
      id: b.id,
      progress: Math.min(1, b.dist / FINISH_DIST),
      color: b.color,
      isHuman: b.isHuman,
    })),
    place: order.findIndex((b) => b.id === 0) + 1,
    finished: state.finished,
    winner: state.winnerId !== null ? (state.bikers[state.winnerId]?.name ?? null) : null,
  };
}

const EMPTY_HUD: Hud = {
  humans: [],
  dots: [],
  place: 1,
  finished: false,
  winner: null,
};

export function RoadRashScreen() {
  const navigation = useNavigation<any>();
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<RaceMode>('1p');
  const [racing, setRacing] = useState(false);
  /** Bumped on every start so the scene rebuilds its bikes from scratch. */
  const [raceKey, setRaceKey] = useState(0);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [result, setResult] = useState<{ title: string; desc: string } | null>(null);

  const stateRef = useRef<RaceState>(createRaceState('1p', width, height));

  const start = (next: RaceMode) => {
    stateRef.current = createRaceState(next, width, height);
    setMode(next);
    setHud(hudOf(stateRef.current));
    setResult(null);
    setRaceKey((k) => k + 1);
    setRacing(true);
    haptic('medium');
  };

  const toMenu = () => {
    setRacing(false);
    setResult(null);
  };

  /**
   * The one place the simulation talks back to React. It also drains the
   * event queue, which is what turns a kick landing into a thump you feel.
   */
  const onHud = useCallback((state: RaceState) => {
    for (const event of takeEvents(state)) {
      if (event.type === 'hit' && event.attacker === 0) haptic('medium');
      else if (event.type === 'wipeout' && event.biker === 0) haptic('error');
      else if (event.type === 'crash' && event.biker === 0) haptic('heavy');
      else if (event.type === 'nitro' && event.biker === 0) haptic('light');
      else if (event.type === 'finish') haptic('success');
    }
    const next = hudOf(state);
    setHud(next);
    if (next.finished && next.winner) {
      const winnerIsYou = state.winnerId !== null && state.bikers[state.winnerId].isHuman;
      setResult((prev) =>
        prev ?? {
          title: `${next.winner} WINS!`,
          desc: winnerIsYou
            ? 'You held the line all the way to the flag.'
            : 'The CPU took the flag — run it back.',
        },
      );
    }
  }, []);

  // Leaving the screen mid-race should not keep the loop running.
  useEffect(() => navigation.addListener?.('blur', () => setRacing(false)), [navigation]);

  const arena = useMemo(
    () => (
      <GameCanvas
        key={raceKey}
        style={staticStyles.canvas}
        orthographic
        camera={{ position: [0, 0, 10], near: 0.1, far: 100 }}
        fallback={
          <View style={staticStyles.glFallback}>
            <Text style={styles.glFallbackText}>
              This race needs 3D graphics, which this device turned down.
            </Text>
          </View>
        }
      >
        <RaceScene3D stateRef={stateRef} paused={!!result} onHud={onHud} />
      </GameCanvas>
    ),
    [raceKey, result, onHud],
  );

  const fire = (seat: number, action: 'left' | 'right' | 'punch' | 'kick' | 'nitro') => {
    const state = stateRef.current;
    switch (action) {
      case 'left':
        raceSteer(state, seat, -1);
        haptic('selection');
        break;
      case 'right':
        raceSteer(state, seat, 1);
        haptic('selection');
        break;
      case 'nitro':
        if (raceNitro(state, seat)) haptic('light');
        break;
      default:
        raceAttack(state, seat, action as AttackType);
        haptic('light');
    }
  };

  if (!racing) {
    return (
      <Screen>
        <View style={staticStyles.root}>
          <Header subtitle="Same phone · 1P – 4P" />
          <ScrollView contentContainerStyle={staticStyles.menu}>
            <View style={styles.modeCard}>
              <Text style={styles.modeLabel}>SELECT PLAYERS MODE</Text>
              <View style={staticStyles.modeGrid}>
                {MODES.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMode(m);
                      haptic('selection');
                    }}
                    style={[styles.modeBtn, mode === m && styles.modeBtnOn]}
                    accessibilityRole="button"
                    accessibilityLabel={`${MODE_LABEL[m]} mode`}
                  >
                    <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextOn]}>
                      {MODE_LABEL[m]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.modeHint}>
                {mode === '1p'
                  ? 'You against three CPU riders.'
                  : `${humansIn(mode)} riders share this phone — one pad each. The rest are CPU.`}
              </Text>
            </View>

            <Pressable
              onPress={() => start(mode)}
              style={styles.gameCard}
              accessibilityRole="button"
              accessibilityLabel="Start the race"
            >
              <View style={styles.gameEmojiBox}>
                <Text style={staticStyles.gameEmoji}>🏍️</Text>
              </View>
              <View style={staticStyles.flex}>
                <Text style={styles.gameKicker}>ROAD RASH BIKE COMBAT</Text>
                <Text style={styles.gameTitle}>ROAD RASH RUSH</Text>
                <Text style={styles.gameDesc}>
                  Punch, kick aur chain attack se rivals ko gira kar finish line jeetein. Traffic
                  dodge karo, nitro pads uthao.
                </Text>
              </View>
            </Pressable>

            <View style={styles.tipsCard}>
              <Text style={styles.tipsHead}>HOW TO RIDE</Text>
              {[
                '◀ ▶ lane badalte hain — chaar lanes hain.',
                'PUNCH se rival ki health girti hai, KICK se woh seedha gir jata hai.',
                'NITRO 25% se upar chahiye; road pe ⚡ pads se nitro refill hota hai.',
                'Traffic car se takraye toh wipeout — bike ghoom jayegi.',
              ].map((line) => (
                <View key={line} style={staticStyles.tipRow}>
                  <View style={styles.tipDot} />
                  <Text style={styles.tipText}>{line}</Text>
                </View>
              ))}
            </View>

            {!supports3D() ? (
              <Text style={styles.warn}>
                This device has no GL canvas available, so the race will not run here.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </Screen>
    );
  }

  const seats = humansIn(mode);

  return (
    <Screen>
      <View style={staticStyles.root}>
        <Header subtitle={`${MODE_LABEL[mode]} · race in progress`} onBack={toMenu} />

        <View style={staticStyles.arena}>
          {arena}

          {/* ── HUD ──────────────────────────────────────────────────── */}
          <View style={staticStyles.hud} pointerEvents="none">
            <View style={styles.trackBar}>
              <View style={staticStyles.trackLine} />
              {hud.dots.map((dot) => (
                <View
                  key={dot.id}
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
              <View style={styles.placeChip}>
                <Text style={styles.placeText}>{ordinal(hud.place)}</Text>
              </View>
              {hud.humans.map((h) => (
                <View key={h.id} style={[styles.statChip, { borderColor: h.color }]}>
                  <Text style={[styles.statName, { color: h.color }]}>{h.name}</Text>
                  <Text style={styles.statText}>
                    HP {h.hp} · {h.kmh} KM/H · N {h.nitro}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── CONTROLS ───────────────────────────────────────────────── */}
        <View style={styles.controls}>
          {seats === 1 ? (
            <View style={staticStyles.pad1p}>
              <View style={staticStyles.padGroup}>
                <PadButton label="◀ LEFT" onPress={() => fire(0, 'left')} />
                <PadButton label="RIGHT ▶" onPress={() => fire(0, 'right')} />
              </View>
              <View style={staticStyles.padGroup}>
                <PadButton label="👊 PUNCH" tone="amber" onPress={() => fire(0, 'punch')} />
                <PadButton label="🦵 KICK" tone="rose" onPress={() => fire(0, 'kick')} />
                <PadButton label="🔥 NITRO" tone="sky" onPress={() => fire(0, 'nitro')} />
              </View>
            </View>
          ) : seats === 2 ? (
            <View style={staticStyles.pad2p}>
              {[0, 1].map((seat) => (
                <View
                  key={seat}
                  style={[
                    styles.seatBox,
                    { backgroundColor: SEAT[seat].tint, borderColor: SEAT[seat].edge },
                  ]}
                >
                  <Text style={[styles.seatTag, { color: SEAT[seat].color }]}>
                    {SEAT[seat].name}
                  </Text>
                  <PadButton small label="◀" onPress={() => fire(seat, 'left')} />
                  <PadButton small label="▶" onPress={() => fire(seat, 'right')} />
                  <PadButton small label="HIT" tone="rose" onPress={() => fire(seat, 'kick')} />
                  <PadButton small label="🔥" tone="amber" onPress={() => fire(seat, 'nitro')} />
                </View>
              ))}
            </View>
          ) : (
            <View style={staticStyles.padMulti}>
              {Array.from({ length: seats }).map((_, seat) => (
                <View
                  key={seat}
                  style={[
                    styles.seatBoxCompact,
                    { backgroundColor: SEAT[seat].tint, borderColor: SEAT[seat].edge },
                  ]}
                >
                  <Text style={[styles.seatTag, { color: SEAT[seat].color }]}>
                    {SEAT[seat].name}
                  </Text>
                  <PadButton small label="◀" onPress={() => fire(seat, 'left')} />
                  <PadButton small label="▶" onPress={() => fire(seat, 'right')} />
                  <PadButton small label="KICK" tone="rose" onPress={() => fire(seat, 'kick')} />
                  <PadButton small label="🔥" tone="amber" onPress={() => fire(seat, 'nitro')} />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── RESULT ─────────────────────────────────────────────────── */}
        <Modal visible={!!result} transparent animationType="fade" onRequestClose={toMenu}>
          <View style={staticStyles.scrim}>
            <View style={styles.resultCard}>
              <Text style={staticStyles.resultEmoji}>🏍️</Text>
              <Text style={styles.resultTitle}>{result?.title}</Text>
              <Text style={styles.resultDesc}>{result?.desc}</Text>
              <Pressable
                onPress={() => start(mode)}
                style={styles.primaryBtn}
                accessibilityRole="button"
                accessibilityLabel="Race again"
              >
                <Text style={styles.primaryBtnText}>REMATCH</Text>
              </Pressable>
              <Pressable
                onPress={toMenu}
                style={styles.ghostBtn}
                accessibilityRole="button"
                accessibilityLabel="Change mode"
              >
                <Text style={styles.ghostBtnText}>CHANGE MODE</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}

/** 1 → 1st, 2 → 2nd … for the position chip. */
function ordinal(place: number): string {
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  return `${place}${suffix}`;
}

function Header({ subtitle, onBack }: { subtitle: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to the menu"
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : null}
      <View style={styles.logoOuter}>
        <View style={styles.logoInner}>
          <Text style={styles.logoText}>RR</Text>
        </View>
      </View>
      <View style={staticStyles.flex}>
        <Text style={styles.wordmark}>ROAD RASH RUSH</Text>
        <Text style={styles.wordmarkSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function PadButton({
  label,
  onPress,
  tone = 'slate',
  small,
}: {
  label: string;
  onPress: () => void;
  tone?: 'slate' | 'amber' | 'rose' | 'sky';
  small?: boolean;
}) {
  return (
    <Pressable
      // Steering is one lane per press, so the press *down* is the input —
      // waiting for the release makes the bike feel a frame late.
      onPressIn={onPress}
      style={({ pressed }) => [
        small ? styles.padBtnSmall : styles.padBtn,
        tone === 'amber' && styles.padAmber,
        tone === 'rose' && styles.padRose,
        tone === 'sky' && styles.padSky,
        pressed && staticStyles.padPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          small ? styles.padTextSmall : styles.padText,
          (tone === 'amber' || tone === 'sky') && styles.padTextDark,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Layout-only styles, with no colour decisions in them. */
const staticStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.abyss },
  flex: { flex: 1 },
  menu: { padding: 16, gap: 14 },
  modeGrid: { flexDirection: 'row', gap: 8 },
  gameEmoji: { fontSize: 30 },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  arena: { flex: 1, overflow: 'hidden' },
  canvas: { flex: 1, borderRadius: 0 },
  glFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
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
  pad1p: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  padGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pad2p: { flexDirection: 'row', gap: 8 },
  padMulti: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  backText: { fontSize: 22, lineHeight: 24, color: C.amberText, fontWeight: '800' },
  logoOuter: {
    width: 32,
    height: 32,
    borderRadius: 12,
    padding: 2,
    backgroundColor: C.rose,
  },
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

  modeCard: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
    gap: 10,
  },
  modeLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: C.muted },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeBtnOn: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderColor: '#fbbf24',
    borderWidth: 2,
  },
  modeBtnText: { fontFamily: ARCADE_FONT, fontSize: 12, fontWeight: '800', color: '#cbd5e1' },
  modeBtnTextOn: { color: '#fcd34d' },
  modeHint: { fontSize: 11, color: C.dim },

  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: 'rgba(14,165,233,0.5)',
  },
  gameEmojiBox: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0369a1',
  },
  gameKicker: {
    fontFamily: ARCADE_FONT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: C.sky,
  },
  gameTitle: {
    fontFamily: ARCADE_FONT,
    fontSize: 19,
    fontWeight: '900',
    color: '#fff',
    marginTop: 2,
    letterSpacing: 0.6,
  },
  gameDesc: { fontSize: 12, color: '#cbd5e1', marginTop: 4, lineHeight: 17 },

  tipsCard: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: C.line,
    gap: 8,
  },
  tipsHead: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: C.amberText },
  tipDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.amber, marginTop: 6 },
  tipText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#cbd5e1' },
  warn: { fontSize: 12, color: '#fda4af', textAlign: 'center' },
  glFallbackText: { fontSize: 13, color: C.muted, textAlign: 'center' },

  trackBar: {
    width: '74%',
    maxWidth: 300,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.panel,
    justifyContent: 'center',
  },
  trackDot: { position: 'absolute', marginLeft: 4, borderWidth: 1, borderColor: '#0f172a' },
  statChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,23,0.75)',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
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
  statName: { fontFamily: ARCADE_FONT, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  statText: { fontSize: 10, fontWeight: '700', color: '#e2e8f0' },

  controls: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  padBtn: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  padBtnSmall: {
    flexGrow: 1,
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  padAmber: { backgroundColor: C.amber, borderColor: '#fbbf24' },
  padRose: { backgroundColor: '#e11d48', borderColor: '#fb7185' },
  padSky: { backgroundColor: C.sky, borderColor: '#7dd3fc' },
  padText: { fontFamily: ARCADE_FONT, fontSize: 13, fontWeight: '900', color: '#fff' },
  padTextSmall: { fontFamily: ARCADE_FONT, fontSize: 11, fontWeight: '900', color: '#fff' },
  padTextDark: { color: '#020617' },
  seatBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  seatBoxCompact: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    padding: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  seatTag: { fontFamily: ARCADE_FONT, fontSize: 10, fontWeight: '900', paddingHorizontal: 2 },

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
  ghostBtn: {
    width: '100%',
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.9)',
  },
  ghostBtnText: { fontSize: 11, fontWeight: '800', color: '#cbd5e1', letterSpacing: 0.6 },
});
