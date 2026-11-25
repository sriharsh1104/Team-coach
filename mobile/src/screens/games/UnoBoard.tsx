import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  RoomView,
  UNO_COLORS,
  UnoCard,
  UnoColor,
  unoLabel,
} from '../../api/games';

/**
 * UNO — the table, as the reference design lays it out.
 *
 * Opponents sit round the top and sides with their card counts, the deck and
 * the discard pile share a slowly turning direction ring in the middle, and
 * your own hand fans along the bottom with the playable cards lifted and lit.
 * The server decides what is legal; this screen only ever shows it.
 */

/** Palette lifted straight from the reference card art. */
const FACE: Record<UnoColor | 'wild', { from: string; to: string; ink: string }> = {
  red: { from: '#ef4444', to: '#b91c1c', ink: '#dc2626' },
  blue: { from: '#3b82f6', to: '#1d4ed8', ink: '#2563eb' },
  green: { from: '#22c55e', to: '#15803d', ink: '#16a34a' },
  yellow: { from: '#facc15', to: '#ca8a04', ink: '#ca8a04' },
  wild: { from: '#1e293b', to: '#090d16', ink: '#f8fafc' },
};

const C = {
  abyss: '#090d16',
  deep: '#1e293b',
  panel: 'rgba(15,23,42,0.85)',
  slate900: '#0f172a',
  line: '#1e293b',
  lineSoft: 'rgba(51,65,85,0.8)',
  amber: '#f59e0b',
  amberText: '#fbbf24',
  amberSoft: 'rgba(245,158,11,0.15)',
  amberEdge: 'rgba(245,158,11,0.4)',
  emerald: '#34d399',
  sky: '#38bdf8',
  rose: '#e11d48',
  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
};

const DISPLAY_FONT = Platform.select({ ios: 'Avenir Next', default: 'sans-serif-medium' });

const CARD_W = 66;
const CARD_H = 99;
/** How far each hand card tucks under the one before it. */
const HAND_OVERLAP = -18;

/** The chip colours behind the active-colour label and the status dot. */
const COLOR_CHIP: Record<UnoColor, { bg: string; fg: string; border: string; dot: string }> = {
  red: { bg: 'rgba(239,68,68,0.2)', fg: '#fca5a5', border: 'rgba(239,68,68,0.4)', dot: '#ef4444' },
  blue: { bg: 'rgba(59,130,246,0.2)', fg: '#93c5fd', border: 'rgba(59,130,246,0.4)', dot: '#3b82f6' },
  green: { bg: 'rgba(16,185,129,0.2)', fg: '#6ee7b7', border: 'rgba(16,185,129,0.4)', dot: '#22c55e' },
  yellow: { bg: 'rgba(250,204,21,0.2)', fg: '#fde68a', border: 'rgba(250,204,21,0.4)', dot: '#facc15' },
};

/** Stable, unique gradient id — react-native-svg keeps defs in one namespace. */
function gradId(card: UnoCard): string {
  return `uno${card.id.replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** The four-colour wheel printed on a plain Wild card. */
function WildWheel({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 34 34">
      <Path d="M17 17 L17 0 A17 17 0 0 1 34 17 Z" fill="#ef4444" />
      <Path d="M17 17 L34 17 A17 17 0 0 1 17 34 Z" fill="#3b82f6" />
      <Path d="M17 17 L17 34 A17 17 0 0 1 0 17 Z" fill="#facc15" />
      <Path d="M17 17 L0 17 A17 17 0 0 1 17 0 Z" fill="#22c55e" />
      <Circle cx={17} cy={17} r={16} fill="none" stroke="#0f172a" strokeWidth={2} />
    </Svg>
  );
}

/** One face-up card: gradient ground, tilted white oval, corner indices. */
export function UnoCardFace({
  card,
  width = CARD_W,
  dim,
}: {
  card: UnoCard;
  width?: number;
  dim?: boolean;
}) {
  const height = Math.round((width / CARD_W) * CARD_H);
  const isWild = card.value === 'wild' || card.value === 'wild4';
  const key = (isWild && card.color === null ? 'wild' : (card.color ?? 'wild')) as
    | UnoColor
    | 'wild';
  const paint = FACE[key];
  const label = unoLabel(card);
  const scale = width / CARD_W;
  const id = gradId(card);

  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          borderRadius: Math.round(12 * scale),
          borderWidth: Math.max(2, Math.round(3.5 * scale)),
        },
        dim && styles.cardDim,
      ]}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={paint.from} />
            <Stop offset="1" stopColor={paint.to} />
          </LinearGradient>
        </Defs>
        <Rect width={CARD_W} height={CARD_H} fill={`url(#${id})`} />
        {/* The classic tilted white oval. Wilds keep the dark ground bare. */}
        {card.value === 'wild' ? null : (
          <Ellipse
            cx={CARD_W / 2}
            cy={CARD_H / 2}
            rx={CARD_W * 0.41}
            ry={CARD_H * 0.33}
            fill="#ffffff"
            transform={`rotate(-28 ${CARD_W / 2} ${CARD_H / 2})`}
          />
        )}
      </Svg>

      <Text style={[styles.cornerTL, { fontSize: Math.round(11 * scale) }]}>{label}</Text>
      {card.value === 'wild' ? (
        <WildWheel size={Math.round(34 * scale)} />
      ) : (
        <Text
          style={[
            styles.centerVal,
            {
              fontSize: Math.round(28 * scale),
              color: card.value === 'wild4' ? '#f43f5e' : paint.ink,
            },
          ]}
        >
          {label}
        </Text>
      )}
      <Text style={[styles.cornerBR, { fontSize: Math.round(11 * scale) }]}>{label}</Text>
    </View>
  );
}

/** The deck's back: dark ground, red oval, UNO wordmark on the tilt. */
function UnoCardBack({ width = CARD_W }: { width?: number }) {
  const height = Math.round((width / CARD_W) * CARD_H);
  const scale = width / CARD_W;
  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          borderRadius: Math.round(12 * scale),
          borderWidth: Math.max(2, Math.round(3.5 * scale)),
        },
      ]}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="unoBack" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#18181b" />
            <Stop offset="1" stopColor="#09090b" />
          </LinearGradient>
        </Defs>
        <Rect width={CARD_W} height={CARD_H} fill="url(#unoBack)" />
        <Ellipse
          cx={CARD_W / 2}
          cy={CARD_H / 2}
          rx={CARD_W * 0.41}
          ry={CARD_H * 0.31}
          fill="#dc2626"
          stroke="#facc15"
          strokeWidth={2}
          transform={`rotate(-28 ${CARD_W / 2} ${CARD_H / 2})`}
        />
      </Svg>
      <Text style={[styles.backText, { fontSize: Math.round(15 * scale) }]}>UNO</Text>
    </View>
  );
}

/** An opponent: who they are, how many cards, and whether they have shouted. */
function OpponentChip({
  name,
  count,
  isTurn,
  calledUno,
  /** The top seat gets the fanned card backs; the side seats are compact. */
  showBacks,
  align = 'left',
}: {
  name: string;
  count: number;
  isTurn: boolean;
  calledUno: boolean;
  showBacks?: boolean;
  align?: 'left' | 'right';
}) {
  const initials = (name.trim()[0] ?? '?').toUpperCase();
  const avatar = (
    <View style={[styles.oppAvatar, isTurn && styles.oppAvatarLive]}>
      <Text style={styles.oppAvatarText}>{initials}</Text>
    </View>
  );
  return (
    <View style={[styles.oppBox, isTurn && styles.oppBoxLive]}>
      {align === 'left' ? avatar : null}
      <View style={align === 'right' ? styles.oppRightAlign : undefined}>
        <View style={[styles.oppNameRow, align === 'right' && styles.oppNameRowRight]}>
          <Text style={styles.oppName} numberOfLines={1}>
            {name}
          </Text>
          {calledUno ? (
            <View style={styles.unoBadge}>
              <Text style={styles.unoBadgeText}>UNO!</Text>
            </View>
          ) : null}
        </View>
        {showBacks ? (
          <View style={styles.oppBacks}>
            {Array.from({ length: Math.min(count, 7) }).map((_, i) => (
              <View key={i} style={styles.oppBackCard} />
            ))}
          </View>
        ) : (
          <Text style={styles.oppCountLine}>
            <Text style={styles.oppCountNum}>{count}</Text> cards
          </Text>
        )}
      </View>
      {showBacks ? (
        <View style={styles.oppCountPill}>
          <Text style={styles.oppCountPillText}>{count}</Text>
        </View>
      ) : null}
      {align === 'right' ? avatar : null}
    </View>
  );
}

export function UnoBoard({
  room,
  meId,
  busy,
  subtitle,
  onLeave,
  onPlay,
  onDraw,
  onPass,
  onCall,
}: {
  room: RoomView;
  meId: string;
  busy: boolean;
  subtitle?: string;
  onLeave?: () => void;
  onPlay: (cardId: string, color?: UnoColor) => void;
  onDraw: () => void;
  onPass: () => void;
  onCall: () => void;
}) {
  const uno = room.uno!;
  const [wildFor, setWildFor] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);

  const nameOf = (id: string) =>
    room.players?.find((p) => p.userId === id)?.name?.trim() ||
    (id === meId ? 'You' : 'Player');

  const myTurn = uno.phase === 'play' && uno.turnId === meId;
  const playable = useMemo(() => new Set(uno.playable), [uno.playable]);
  const myCount = uno.counts[meId] ?? uno.hand.length;
  const iCalledUno = !!uno.calledUno[meId];
  // Nothing in hand will go and the deck has already been tapped: the only
  // move left is to hand the turn on.
  const mustPass = myTurn && uno.youDrew && playable.size === 0;

  /**
   * Opponents in turn order starting from the player after you, so the one
   * who plays next is always the one on the left — the same reading order
   * the reference layout uses.
   */
  const opponents = useMemo(() => {
    const ids = uno.playerIds;
    const mine = ids.indexOf(meId);
    const start = mine < 0 ? 0 : mine;
    const out: { id: string; name: string; count: number; isTurn: boolean; uno: boolean }[] = [];
    for (let i = 1; i < ids.length; i++) {
      const id = ids[(start + i) % ids.length];
      out.push({
        id,
        name: nameOf(id),
        count: uno.counts[id] ?? 0,
        isTurn: uno.turnId === id,
        uno: !!uno.calledUno[id],
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uno.playerIds, uno.counts, uno.turnId, uno.calledUno, meId, room.players]);

  // Two players: the one opponent sits across the table. Three: the two sit
  // either side. Four: left, across, right.
  const [left, top, right] = useMemo(() => {
    if (opponents.length <= 1) return [null, opponents[0] ?? null, null];
    if (opponents.length === 2) return [opponents[0], null, opponents[1]];
    return [opponents[0], opponents[1], opponents[2]];
  }, [opponents]);

  // The dashed ring turns the way play is going — a glance tells you whether
  // a Reverse has been played without reading a line of text.
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const spinDeg = spin.interpolate({
    inputRange: [0, 1],
    outputRange: uno.direction === 1 ? ['0deg', '360deg'] : ['360deg', '0deg'],
  });

  // The SHOUT button beats when you are one card from the shout being due.
  const pulse = useRef(new Animated.Value(0)).current;
  const shoutDue = uno.phase === 'play' && myCount <= 2 && !iCalledUno;
  useEffect(() => {
    if (!shoutDue) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shoutDue, pulse]);

  const chip = COLOR_CHIP[uno.activeColor];
  const top3 = uno.topCard;

  const status = useMemo(() => {
    if (uno.phase === 'done') {
      return uno.winnerId === meId
        ? 'You won the round!'
        : `${nameOf(uno.winnerId ?? '')} won the round`;
    }
    if (!myTurn) return `${nameOf(uno.turnId)}'s turn`;
    if (mustPass) return 'Nothing to play — pass the turn';
    const face = top3 ? ` or ${unoLabel(top3)}` : '';
    return `Your turn — match ${uno.activeColor.toUpperCase()}${face}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uno.phase, uno.winnerId, uno.turnId, uno.activeColor, myTurn, mustPass, top3, meId, room.players]);

  const tapCard = (card: UnoCard) => {
    if (busy || !myTurn || !playable.has(card.id)) return;
    if (card.value === 'wild' || card.value === 'wild4') {
      setWildFor(card.id);
      return;
    }
    onPlay(card.id);
  };

  const showResult = uno.phase === 'done' && !resultDismissed;

  return (
    <View style={styles.root}>
      {/* ── BRAND BAR ───────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text style={styles.logoText}>UNO</Text>
            </View>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.wordmark}>UNO ROYAL</Text>
            <Text style={styles.wordmarkSub} numberOfLines={1}>
              {subtitle ?? `${uno.playerIds.length} players • Official rules`}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setRulesOpen(true)}
            style={styles.rulesBtn}
            accessibilityRole="button"
            accessibilityLabel="How to play"
          >
            <Text style={styles.rulesBtnText}>Rules</Text>
          </Pressable>
          {onLeave ? (
            <Pressable
              onPress={onLeave}
              style={styles.leaveBtn}
              accessibilityRole="button"
              accessibilityLabel="Leave the match"
            >
              <Text style={styles.leaveBtnText}>Leave</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── OPPONENTS ───────────────────────────────────────────────── */}
      <View style={styles.oppArena}>
        {top ? (
          <OpponentChip
            name={top.name}
            count={top.count}
            isTurn={top.isTurn}
            calledUno={top.uno}
            showBacks
          />
        ) : null}
        {left || right ? (
          <View style={styles.sideRow}>
            {left ? (
              <OpponentChip
                name={left.name}
                count={left.count}
                isTurn={left.isTurn}
                calledUno={left.uno}
              />
            ) : (
              <View />
            )}
            {right ? (
              <OpponentChip
                name={right.name}
                count={right.count}
                isTurn={right.isTurn}
                calledUno={right.uno}
                align="right"
              />
            ) : (
              <View />
            )}
          </View>
        ) : null}
      </View>

      {/* ── TABLE ───────────────────────────────────────────────────── */}
      <View style={styles.table}>
        <View style={styles.statusBanner}>
          <View style={[styles.statusDot, { backgroundColor: chip.dot }]} />
          <Text style={styles.statusText} numberOfLines={1}>
            {status}
          </Text>
        </View>

        <View style={styles.feltWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.directionRing, { transform: [{ rotate: spinDeg }] }]}
          >
            <Text style={styles.dirArrow}>{uno.direction === 1 ? '↻' : '↺'}</Text>
            <Text style={styles.dirArrow}>{uno.direction === 1 ? '↻' : '↺'}</Text>
          </Animated.View>

          <View style={styles.piles}>
            {/* DRAW PILE */}
            <View style={styles.pile}>
              <Pressable
                onPress={onDraw}
                disabled={busy || !myTurn || uno.youDrew}
                style={({ pressed }) => [
                  pressed && styles.pressed,
                  (busy || !myTurn || uno.youDrew) && styles.pileDim,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Draw a card"
              >
                <UnoCardBack />
                <View style={styles.deckBadge}>
                  <Text style={styles.deckBadgeText}>{uno.drawPileCount}</Text>
                </View>
              </Pressable>
              <Text style={styles.pileLabel}>Draw Deck</Text>
            </View>

            {/* DISCARD PILE */}
            <View style={styles.pile}>
              {top3 ? <UnoCardFace card={top3} /> : <View style={styles.emptyPile} />}
              <View
                style={[
                  styles.colorLabel,
                  { backgroundColor: chip.bg, borderColor: chip.border },
                ]}
              >
                <Text style={[styles.colorLabelText, { color: chip.fg }]}>
                  {uno.activeColor.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.coachTip} numberOfLines={2}>
          {myTurn
            ? mustPass
              ? 'That card will not go either — tap Pass Turn.'
              : 'Glowing cards can be played. If none match, tap Draw Deck.'
            : (uno.lastEvent ?? 'Waiting for the next player…')}
        </Text>
      </View>

      {/* ── YOUR SEAT ───────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.youRow}>
          <View style={styles.youLeft}>
            <View style={[styles.turnDot, myTurn && styles.turnDotLive]} />
            <Text style={styles.youName}>You</Text>
            <Text style={styles.youCount}>
              (<Text style={styles.youCountNum}>{myCount}</Text> cards)
            </Text>
            {iCalledUno ? (
              <View style={styles.unoCalledPill}>
                <Text style={styles.unoCalledText}>UNO CALLED!</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.youActions}>
            {mustPass ? (
              <Pressable
                onPress={onPass}
                disabled={busy}
                style={({ pressed }) => [styles.passBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Pass the turn"
              >
                <Text style={styles.passBtnText}>Pass Turn →</Text>
              </Pressable>
            ) : null}
            <Animated.View
              style={{
                transform: [
                  { scale: shoutDue ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) : 1 },
                ],
              }}
            >
              <Pressable
                onPress={onCall}
                disabled={busy || myCount > 2 || iCalledUno || uno.phase !== 'play'}
                style={({ pressed }) => [
                  styles.shoutBtn,
                  (myCount > 2 || iCalledUno) && styles.shoutBtnOff,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Shout UNO"
              >
                <Text style={styles.shoutBtnText}>SHOUT UNO!</Text>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hand}
        >
          {uno.hand.length === 0 ? (
            <Text style={styles.handEmpty}>No cards left.</Text>
          ) : (
            uno.hand.map((card, i) => {
              const canPlay = myTurn && playable.has(card.id);
              return (
                <Pressable
                  key={card.id}
                  onPress={() => tapCard(card)}
                  disabled={busy || !canPlay}
                  style={[
                    i > 0 && styles.handStacked,
                    canPlay && styles.handCardUp,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${card.color ?? 'wild'} ${unoLabel(card)}${
                    canPlay ? ', playable' : ''
                  }`}
                >
                  <UnoCardFace card={card} dim={!canPlay} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* ── WILD COLOUR PICKER ──────────────────────────────────────── */}
      <Modal visible={!!wildFor} transparent animationType="fade" onRequestClose={() => setWildFor(null)}>
        <View style={styles.scrim}>
          <View style={[styles.card3xl, styles.cardAmber]}>
            <Text style={styles.modalTitle}>Choose Active Color</Text>
            <Text style={styles.modalSub}>Select the next color to be played</Text>
            <View style={styles.colorGrid}>
              {UNO_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => {
                    const id = wildFor;
                    setWildFor(null);
                    if (id) onPlay(id, color);
                  }}
                  style={({ pressed }) => [
                    styles.colorBtn,
                    { backgroundColor: FACE[color].from, borderColor: '#fff' },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${color}`}
                >
                  <Text
                    style={[
                      styles.colorBtnText,
                      color === 'yellow' && styles.colorBtnTextDark,
                    ]}
                  >
                    {color.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => setWildFor(null)}
              style={styles.ghostBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel the wild card"
            >
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── RULES ───────────────────────────────────────────────────── */}
      <Modal visible={rulesOpen} transparent animationType="fade" onRequestClose={() => setRulesOpen(false)}>
        <View style={styles.scrim}>
          <View style={[styles.card3xl, styles.cardSky, styles.rulesCard]}>
            <View style={styles.rulesHead}>
              <Text style={styles.modalTitle}>UNO Kaise Khelte Hain?</Text>
              <Pressable
                onPress={() => setRulesOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close the rules"
              >
                <Text style={styles.closeX}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.rulesScroll} contentContainerStyle={styles.rulesBody}>
              <View style={styles.ruleBlock}>
                <Text style={[styles.ruleHead, { color: C.emerald }]}>1. Goal (Jeetne ka tarika)</Text>
                <Text style={styles.ruleText}>
                  Sabse pehle apne haath ke saare cards khatam karne wala player jeet jata hai.
                </Text>
              </View>
              <View style={styles.ruleBlock}>
                <Text style={[styles.ruleHead, { color: C.sky }]}>2. Card kaise chalna hai?</Text>
                <Text style={styles.ruleText}>
                  Beech mein pade card ka colour (Red, Blue, Green, Yellow) ya number/symbol match
                  karke apna card chalein. Koi card match nahi hota, toh Draw Deck se 1 card uthayein.
                </Text>
              </View>
              <View style={styles.ruleBlock}>
                <Text style={[styles.ruleHead, { color: C.amberText }]}>3. Special action cards</Text>
                {[
                  'Skip (⊘): agle player ki turn miss ho jati hai.',
                  'Reverse (⇄): khelne ki direction ulti ho jati hai — 2 players mein Skip ki tarah.',
                  'Draw Two (+2): agle player ko 2 cards uthane padte hain aur uski turn skip hoti hai.',
                  'Wild (W): kisi bhi card par chal sakte hain, aur naya colour choose karte hain.',
                  'Wild Draw Four (+4): naya colour choose karein, agle player ko 4 cards milte hain.',
                ].map((line) => (
                  <View key={line} style={styles.bulletRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.ruleText}>{line}</Text>
                  </View>
                ))}
              </View>
              <View style={[styles.ruleBlock, styles.ruleBlockWarn]}>
                <Text style={[styles.ruleHead, { color: '#fb7185' }]}>4. "SHOUT UNO!" rule</Text>
                <Text style={styles.ruleText}>
                  Jab aapke paas sirf 2 cards bachein, apna second-last card chalne se pehle SHOUT
                  UNO! dabana zaroori hai. Bhool gaye toh +2 penalty cards milenge.
                </Text>
              </View>
            </ScrollView>
            <Pressable
              onPress={() => setRulesOpen(false)}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Close the rules"
            >
              <Text style={styles.primaryBtnText}>Samajh gaya, let's play!</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── RESULT ──────────────────────────────────────────────────── */}
      <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setResultDismissed(true)}>
        <View style={styles.scrim}>
          <View style={[styles.card3xl, styles.cardAmber, styles.resultCard]}>
            <View style={styles.trophyBadge}>
              <Text style={styles.trophy}>🏆</Text>
            </View>
            <Text style={styles.resultTitle}>
              {uno.winnerId === meId ? 'You Won!' : `${nameOf(uno.winnerId ?? '')} Won`}
            </Text>
            <Text style={styles.modalSub}>
              {uno.endReason === 'forfeit'
                ? 'Everyone else left the table.'
                : uno.winnerId === meId
                  ? 'You emptied your hand first.'
                  : 'They emptied their hand first.'}
            </Text>
            <Pressable
              onPress={() => setResultDismissed(true)}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.abyss },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  // The logo's coloured rim is the UNO palette itself: a two-pixel frame of
  // rose/amber/emerald round a near-black tile.
  logoOuter: {
    width: 32,
    height: 32,
    borderRadius: 12,
    padding: 2,
    backgroundColor: C.amber,
    borderWidth: 1,
    borderColor: '#f43f5e',
  },
  logoInner: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 10, fontWeight: '900', color: C.amberText, letterSpacing: 0.5 },
  brandText: { flexShrink: 1 },
  wordmark: {
    fontFamily: DISPLAY_FONT,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.amberText,
  },
  wordmarkSub: { fontSize: 10, color: C.muted, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rulesBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(2,132,199,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.4)',
  },
  rulesBtnText: { fontSize: 11, fontWeight: '800', color: '#7dd3fc' },
  leaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  leaveBtnText: { fontSize: 11, fontWeight: '700', color: '#fda4af' },

  oppArena: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 8, alignItems: 'center' },
  sideRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  oppBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
    maxWidth: '58%',
  },
  // Whose turn it is, without reading a word.
  oppBoxLive: { borderColor: C.amberEdge, backgroundColor: 'rgba(245,158,11,0.12)' },
  oppAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.5)',
  },
  oppAvatarLive: {
    backgroundColor: C.amberSoft,
    borderColor: C.amberEdge,
  },
  oppAvatarText: { fontSize: 11, fontWeight: '800', color: '#a5b4fc' },
  oppRightAlign: { alignItems: 'flex-end' },
  oppNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  oppNameRowRight: { justifyContent: 'flex-end' },
  oppName: { fontSize: 11, fontWeight: '700', color: '#e2e8f0', flexShrink: 1 },
  oppCountLine: { fontSize: 10, color: C.muted, marginTop: 1 },
  oppCountNum: { color: C.amberText, fontWeight: '800' },
  oppBacks: { flexDirection: 'row', gap: 2, marginTop: 4 },
  oppBackCard: {
    width: 10,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  oppCountPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: C.slate900,
    borderWidth: 1,
    borderColor: '#334155',
  },
  oppCountPillText: { fontSize: 11, fontWeight: '800', color: C.amberText },
  unoBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: C.rose,
  },
  unoBadgeText: { fontSize: 8, fontWeight: '900', color: '#fff' },

  table: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 10 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.9)',
  },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '700', color: C.text, flexShrink: 1 },

  feltWrap: { width: 260, height: 176, alignItems: 'center', justifyContent: 'center' },
  // A dashed ring that turns with the direction of play.
  directionRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(71,85,105,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  dirArrow: { fontSize: 12, fontWeight: '800', color: 'rgba(251,191,36,0.8)' },
  piles: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  pile: { alignItems: 'center', gap: 6 },
  pileDim: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.95 }] },
  deckBadge: {
    position: 'absolute',
    bottom: 5,
    right: 6,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  deckBadgeText: { fontSize: 9, fontWeight: '700', color: '#cbd5e1' },
  pileLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.muted,
    textTransform: 'uppercase',
  },
  emptyPile: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#334155',
  },
  colorLabel: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  colorLabelText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  coachTip: { fontSize: 11, color: C.muted, textAlign: 'center', maxWidth: 300 },

  card: {
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardDim: { opacity: 0.62 },
  cornerTL: {
    position: 'absolute',
    top: 3,
    left: 5,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 13,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 3,
    right: 5,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 13,
    transform: [{ rotate: '180deg' }],
  },
  centerVal: { fontWeight: '900', textAlign: 'center' },
  backText: {
    fontWeight: '900',
    color: '#facc15',
    letterSpacing: 0.5,
    transform: [{ rotate: '-25deg' }],
  },

  footer: {
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
    paddingBottom: 6,
  },
  youRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    gap: 8,
  },
  youLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  turnDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#475569' },
  turnDotLive: {
    backgroundColor: C.emerald,
    shadowColor: C.emerald,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  youName: { fontSize: 13, fontWeight: '800', color: '#fff' },
  youCount: { fontSize: 11, color: C.muted },
  youCountNum: { color: C.amberText, fontWeight: '800' },
  unoCalledPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: C.rose,
  },
  unoCalledText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  youActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#64748b',
  },
  passBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  shoutBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.rose,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#f43f5e',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  shoutBtnOff: { opacity: 0.45 },
  shoutBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 1 },

  // Room above the cards for the playable ones to lift into.
  hand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 4,
    paddingHorizontal: 16,
    minHeight: 135,
  },
  handStacked: { marginLeft: HAND_OVERLAP },
  handCardUp: { transform: [{ translateY: -10 }], zIndex: 5 },
  handEmpty: { fontSize: 12, color: C.dim, fontStyle: 'italic' },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card3xl: {
    width: '100%',
    maxWidth: 340,
    padding: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(15,23,42,0.97)',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  cardAmber: { borderColor: C.amberEdge, alignItems: 'center' },
  cardSky: { borderColor: 'rgba(14,165,233,0.4)' },
  modalTitle: {
    fontFamily: DISPLAY_FONT,
    fontSize: 17,
    fontWeight: '800',
    color: C.amberText,
    flexShrink: 1,
  },
  modalSub: { fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 6 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  colorBtn: {
    width: 128,
    height: 60,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBtnText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  colorBtnTextDark: { color: '#020617' },

  rulesCard: { maxHeight: '85%', maxWidth: 380 },
  rulesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  closeX: { fontSize: 16, color: C.muted, paddingHorizontal: 4 },
  rulesScroll: { flexGrow: 0 },
  rulesBody: { gap: 10, paddingVertical: 10 },
  ruleBlock: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: C.line,
    gap: 4,
  },
  ruleBlockWarn: {
    backgroundColor: 'rgba(76,5,25,0.4)',
    borderColor: 'rgba(244,63,94,0.4)',
  },
  ruleHead: { fontSize: 12, fontWeight: '800' },
  ruleText: { flex: 1, fontSize: 11, lineHeight: 17, color: '#cbd5e1' },
  bulletRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.amber, marginTop: 6 },

  resultCard: { alignItems: 'center' },
  trophyBadge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.amberSoft,
    borderWidth: 1,
    borderColor: C.amberEdge,
  },
  trophy: { fontSize: 28 },
  resultTitle: {
    fontFamily: DISPLAY_FONT,
    fontSize: 22,
    fontWeight: '900',
    color: C.amberText,
  },

  primaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: C.amber,
    marginTop: 8,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '900', color: '#020617' },
  ghostBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.9)',
    marginTop: 8,
  },
  ghostBtnText: { fontSize: 12, fontWeight: '700', color: '#cbd5e1' },
});
