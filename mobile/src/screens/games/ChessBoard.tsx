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
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  ChessPiece,
  ChessPieceType,
  ChessPromotion,
  RoomView,
  chessIndexToSquare,
  chessSquareToIndex,
} from '../../api/games';
import { GameCanvas, supports3D } from '../../games/three/GameCanvas';
import { CHESS_CAMERA, ChessScene3D } from '../../games/three/ChessScene3D';
import { ChessPieceSvg } from './ChessPieceSvg';

/**
 * The "Grandmaster" chess shell.
 *
 * Layout and palette come from the reference design: a branded bar on top,
 * an opponent strip, the board floating in a dark arena with the turn state
 * on a glass pill above it, your own strip, the move tape, and a toolbar.
 * It owns the whole screen rather than sitting in a scroll view, which is
 * what lets the board take every pixel the chrome isn't using.
 */

/** Slate/amber tokens, shared by every panel so the screen reads as one set. */
const C = {
  abyss: '#020617',
  deep: '#0f172a',
  panel: 'rgba(15,23,42,0.85)',
  surface: 'rgba(30,41,59,0.9)',
  line: '#1e293b',
  lineSoft: 'rgba(51,65,85,0.8)',
  frame: '#334155',
  amber: '#f59e0b',
  amberText: '#fbbf24',
  amberSoft: 'rgba(245,158,11,0.15)',
  amberEdge: 'rgba(245,158,11,0.4)',
  emerald: '#34d399',
  sky: '#38bdf8',
  rose: '#fb7185',
  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
  squareLight: '#e2d5c1',
  squareDark: '#7c583c',
};

const DISPLAY_FONT = Platform.select({ ios: 'Georgia', default: 'serif' });
const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Board geometry, in real pixels.
 *
 * One integer cell size, derived from the window — percentage widths inside
 * a wrapping flex container never resolve a height in Yoga, which used to
 * collapse the empty ranks to nothing.
 */
const BOARD_PAD = 12;
function fitBoard(maxWidth: number, maxHeight: number): { cell: number; board: number } {
  const cell = Math.floor(Math.min(maxWidth, maxHeight) / 8);
  return { cell, board: cell * 8 };
}

const PROMOTIONS: ChessPromotion[] = ['q', 'r', 'b', 'n'];
const PROMOTION_LABEL: Record<ChessPromotion, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
};

/** Render position (row/col in the 8×8 grid as actually laid out) for a board index. */
function visualPos(index: number, flip: boolean): { row: number; col: number } {
  const pos = flip ? 63 - index : index;
  return { row: Math.floor(pos / 8), col: pos % 8 };
}

const END_TEXT: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate — draw',
  'fifty-move': 'Draw — fifty-move rule',
  threefold: 'Draw — threefold repetition',
  'insufficient-material': 'Draw — not enough material',
  forfeit: 'Opponent left',
};

/**
 * Longhand for the result card. Deliberately worded differently from
 * END_TEXT above so the card never just echoes the status pill behind it.
 */
const END_DETAIL: Record<string, string> = {
  checkmate: 'The king had nowhere left to run.',
  stalemate: 'No legal move left, and no check — the game is drawn.',
  'fifty-move': 'Fifty moves passed with no capture and no pawn move.',
  threefold: 'The same position came up three times.',
  'insufficient-material': 'Neither side has the material to force mate.',
  forfeit: 'Your opponent left the room.',
};

/** Standard values — only used for the "+3" material lead next to a name. */
const PIECE_VALUE: Record<ChessPieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function materialOf(pieces: ChessPieceType[]): number {
  return pieces.reduce((sum, type) => sum + PIECE_VALUE[type], 0);
}

function CrownIcon({ size = 20, color = C.amberText }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"
        fill={color}
      />
    </Svg>
  );
}

/** Stroked 24×24 line icons, matching the reference toolbar. */
function LineIcon({
  d,
  size = 16,
  color = C.muted,
}: {
  d: string;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const PATH_FLIP = 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4';
const PATH_INFO = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
const PATH_EXIT = 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1';
const PATH_CLOSE = 'M6 18L18 6M6 6l12 12';

/**
 * One player's line above / below the board: who they are, which colour they
 * sit behind, what they have taken, and how far ahead that puts them.
 */
function PlayerStrip({
  name,
  isYou,
  isTurn,
  color,
  /** Pieces this player has captured, drawn in the opponent's colour. */
  captured,
  lead,
  position,
}: {
  name: string;
  isYou: boolean;
  isTurn: boolean;
  color: 'w' | 'b';
  captured: { type: ChessPieceType; color: 'w' | 'b' }[];
  lead: number;
  position: 'top' | 'bottom';
}) {
  return (
    <View style={[styles.playerBar, position === 'top' ? styles.playerBarTop : styles.playerBarBottom]}>
      <View style={styles.playerLeft}>
        <View style={[styles.turnDot, isTurn && styles.turnDotLive]} />
        <Text style={styles.colorTag}>{color === 'w' ? 'WHITE' : 'BLACK'}</Text>
        <Text style={[styles.playerName, isTurn && styles.playerNameLive]} numberOfLines={1}>
          {name}
          {/* Skip the suffix when the name already fell back to "You". */}
          {isYou && name !== 'You' ? ' (You)' : ''}
        </Text>
        {lead > 0 ? <Text style={styles.lead}>+{lead}</Text> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.capturedScroll}
        contentContainerStyle={styles.capturedRow}
      >
        {captured.map((c, i) => (
          <ChessPieceSvg key={`${c.type}-${i}`} type={c.type} color={c.color} size={16} />
        ))}
      </ScrollView>
    </View>
  );
}

export function ChessBoard({
  room,
  meId,
  busy,
  mode = '2d',
  subtitle,
  onModeChange,
  onLeave,
  onFallback,
  onMove,
}: {
  room: RoomView;
  meId: string;
  busy: boolean;
  mode?: '2d' | '3d';
  /** Room title / connection note, shown under the wordmark. */
  subtitle?: string;
  /** Present only when the host screen lets the view be switched. */
  onModeChange?: (mode: '2d' | '3d') => void;
  onLeave?: () => void;
  onFallback?: () => void;
  onMove: (from: string, to: string, promotion?: ChessPromotion) => void;
}) {
  const chess = room.chess!;
  const { width: winW, height: winH } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);

  const myTurn =
    chess.phase === 'play' &&
    !!chess.yourColor &&
    chess.yourColor === chess.turn;

  /** from-square → the squares it may reach, straight off the server list. */
  const movesFrom = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const move of chess.legalMoves) {
      const list = map.get(move.from) ?? [];
      if (!list.includes(move.to)) list.push(move.to);
      map.set(move.from, list);
    }
    return map;
  }, [chess.legalMoves]);

  const targets = selected ? (movesFrom.get(selected) ?? []) : [];

  // Black sees the board from their own side, like sitting across a table —
  // and the Flip button swaps that round for anyone who wants the other view.
  const [manualFlip, setManualFlip] = useState(false);
  const flip = (chess.yourColor === 'b') !== manualFlip;
  const order = useMemo(() => {
    const indices = Array.from({ length: 64 }, (_, i) => i);
    return flip ? indices.reverse() : indices;
  }, [flip]);

  // Without this a move just mutated the board data and the whole 8×8
  // re-rendered from scratch — the piece "teleported" instead of moving.
  // This slides a ghost piece from the old square to the new one on top of
  // the (already-updated) static grid, and hides the static piece at the
  // destination for the ~180ms the slide is in flight so it doesn't show
  // twice. Skips the very first render so an in-progress game doesn't replay
  // its last move on load.
  const [slide, setSlide] = useState<{ piece: ChessPiece; fromIdx: number; toIdx: number } | null>(
    null,
  );
  const slideAnim = useRef(new Animated.Value(1)).current;
  const slideSeqRef = useRef(0);
  const lastSeenMoveRef = useRef<string | null>(
    chess.lastMove ? `${chess.lastMove.from}>${chess.lastMove.to}:${chess.history.length}` : null,
  );
  useEffect(() => {
    const lm = chess.lastMove;
    if (!lm) return;
    const key = `${lm.from}>${lm.to}:${chess.history.length}`;
    if (key === lastSeenMoveRef.current) return;
    lastSeenMoveRef.current = key;
    const fromIdx = chessSquareToIndex(lm.from);
    const toIdx = chessSquareToIndex(lm.to);
    const piece = chess.board[toIdx];
    if (!piece) return;
    const seq = ++slideSeqRef.current;
    setSlide({ piece, fromIdx, toIdx });
    slideAnim.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (slideSeqRef.current === seq) setSlide(null);
    });
  }, [chess.lastMove, chess.history.length, chess.board, slideAnim]);

  // The check square breathes rather than sitting flat, the way the
  // reference board pulses its red wash.
  const checkPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!chess.inCheck) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(checkPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(checkPulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [chess.inCheck, checkPulse]);

  // 2D: the board is the screen's main event. 3D: the same grid is only the
  // tap surface under the scene (hit-testing a GL scene on a phone is far
  // less reliable than tapping a plain 8×8 of Views), so it shrinks.
  const { cell: cellPx, board: boardPx } = useMemo(
    () =>
      mode === '3d'
        ? fitBoard(winW - BOARD_PAD * 4, winH * 0.26)
        : fitBoard(winW - BOARD_PAD * 2, winH * 0.52),
    [mode, winW, winH],
  );
  const cellSize = useMemo(() => ({ width: cellPx, height: cellPx }), [cellPx]);
  const boardSize = useMemo(() => ({ width: boardPx, height: boardPx }), [boardPx]);
  const pieceSize = Math.round(cellPx * 0.82);

  const tap = (square: string) => {
    if (busy || !myTurn) return;
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (selected && targets.includes(square)) {
      // A pawn landing on the back rank has four possible moves to the same
      // square — ask which piece rather than silently assuming a queen.
      const promotes = chess.legalMoves.some(
        (m) => m.from === selected && m.to === square && m.promotion,
      );
      if (promotes) {
        setPendingPromotion({ from: selected, to: square });
        return;
      }
      onMove(selected, square);
      setSelected(null);
      return;
    }
    if (movesFrom.has(square)) setSelected(square);
    else setSelected(null);
  };

  const status = chess.winnerId
    ? chess.winnerId === meId
      ? `You won — ${END_TEXT[chess.endReason ?? ''] ?? 'game over'}`
      : `${END_TEXT[chess.endReason ?? ''] ?? 'Game over'} — you lost`
    : chess.phase === 'done'
      ? (END_TEXT[chess.endReason ?? ''] ?? 'Draw')
      : chess.inCheck
        ? myTurn
          ? 'You are in check'
          : 'Check'
        : myTurn
          ? 'Your move'
          : 'Waiting for their move';

  const statusTone = chess.inCheck ? 'alert' : myTurn ? 'live' : 'idle';

  // Seat 0 is White (the server mints the room that way), and the viewer is
  // always drawn at the bottom — so the strips are "them" on top, "you"
  // underneath, exactly like sitting at the board.
  const seats = useMemo(() => {
    const nameOf = (id: string | undefined) =>
      (id && room.players?.find((p) => p.userId === id)?.name?.trim()) ||
      (id === meId ? 'You' : 'Opponent');
    const whiteId = chess.playerIds?.[0];
    const blackId = chess.playerIds?.[1];
    const takenByWhite = (chess.captured?.w ?? []).map((type) => ({
      type,
      color: 'b' as const,
    }));
    const takenByBlack = (chess.captured?.b ?? []).map((type) => ({
      type,
      color: 'w' as const,
    }));
    const whiteMaterial = materialOf(chess.captured?.w ?? []);
    const blackMaterial = materialOf(chess.captured?.b ?? []);
    const white = {
      name: nameOf(whiteId),
      isYou: whiteId === meId,
      isTurn: chess.phase === 'play' && chess.turn === 'w',
      color: 'w' as const,
      captured: takenByWhite,
      lead: Math.max(0, whiteMaterial - blackMaterial),
    };
    const black = {
      name: nameOf(blackId),
      isYou: blackId === meId,
      isTurn: chess.phase === 'play' && chess.turn === 'b',
      color: 'b' as const,
      captured: takenByBlack,
      lead: Math.max(0, blackMaterial - whiteMaterial),
    };
    // flip is true when the board is drawn with Black at the bottom.
    return flip ? { top: white, bottom: black } : { top: black, bottom: white };
  }, [chess.playerIds, chess.captured, chess.turn, chess.phase, room.players, meId, flip]);

  /** The king that is actually in check, so its square can be lit up. */
  const checkIndex = useMemo(() => {
    if (!chess.inCheck) return -1;
    return chess.board.findIndex(
      (p) => p?.type === 'k' && p.color === chess.turn,
    );
  }, [chess.inCheck, chess.board, chess.turn]);

  // The tape scrolls itself to the newest move, so the live move is always
  // the one under your thumb.
  const tapeRef = useRef<ScrollView>(null);
  useEffect(() => {
    const id = setTimeout(() => tapeRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [chess.history.length]);

  const canSwitchView = !!onModeChange && supports3D();
  const showResult = chess.phase === 'done' && !resultDismissed;
  const resultTitle = chess.winnerId
    ? chess.winnerId === meId
      ? 'Victory'
      : 'Defeat'
    : 'Draw';

  return (
    <View style={styles.root}>
      {/* ── BRAND BAR ───────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandBadge}>
            <CrownIcon size={18} />
          </View>
          <View style={styles.brandText}>
            <Text style={styles.wordmark}>GRANDMASTER</Text>
            <Text style={styles.wordmarkSub} numberOfLines={1}>
              {subtitle ??
                (chess.yourColor
                  ? `You play ${chess.yourColor === 'w' ? 'White' : 'Black'}`
                  : 'Spectating')}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {canSwitchView ? (
            <View style={styles.segment}>
              {(['3d', '2d'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => onModeChange?.(option)}
                  style={[styles.segmentBtn, mode === option && styles.segmentBtnOn]}
                  accessibilityRole="button"
                  accessibilityLabel={option === '3d' ? 'Switch to 3D view' : 'Switch to 2D board'}
                >
                  <Text style={[styles.segmentText, mode === option && styles.segmentTextOn]}>
                    {option === '3d' ? '3D View' : '2D Board'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* ── OPPONENT STRIP ──────────────────────────────────────────── */}
      <PlayerStrip {...seats.top} position="top" />

      {/* ── ARENA ───────────────────────────────────────────────────── */}
      <View style={styles.arena}>
        <View
          style={[
            styles.statusPill,
            statusTone === 'live' && styles.statusPillLive,
            statusTone === 'alert' && styles.statusPillAlert,
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.statusDot,
              statusTone === 'live' && styles.statusDotLive,
              statusTone === 'alert' && styles.statusDotAlert,
            ]}
          />
          <Text style={[styles.statusText, statusTone === 'alert' && styles.statusTextAlert]}>
            {status}
          </Text>
        </View>

        {mode === '3d' ? (
          <GameCanvas
            style={styles.canvas}
            camera={CHESS_CAMERA}
            onFallback={onFallback}
            fallback={<View style={styles.canvas} />}
          >
            <ChessScene3D
              board={chess.board}
              flip={flip}
              selected={selected}
              targets={targets}
              lastMove={chess.lastMove}
            />
          </GameCanvas>
        ) : null}

        <View style={[styles.boardFrame, mode === '3d' && styles.boardFrameCompact]}>
          <View style={[styles.grid, boardSize]}>
            {order.map((index, slot) => {
              const square = chessIndexToSquare(index);
              const piece = chess.board[index];
              const file = index % 8;
              const rank = Math.floor(index / 8);
              const light = (file + rank) % 2 === 0;
              const isTarget = targets.includes(square);
              const isSelected = selected === square;
              const isLast =
                chess.lastMove?.from === square || chess.lastMove?.to === square;
              // The destination piece is suppressed while the ghost below is
              // still sliding into it, so it doesn't appear twice.
              const hideForSlide = !!slide && slide.toIdx === index;
              // Coordinates only on the edges the eye actually reads from —
              // rank down the left column, file along the bottom row, tucked
              // into the corner so they cost no layout space.
              const showRank = slot % 8 === 0;
              const showFile = slot >= 56;
              return (
                <Pressable
                  key={square}
                  style={[
                    styles.cell,
                    cellSize,
                    light ? styles.cellLight : styles.cellDark,
                  ]}
                  onPress={() => tap(square)}
                  accessibilityRole="button"
                  accessibilityLabel={`${square}${piece ? `, ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ', empty'}`}
                >
                  {/* Translucent washes rather than flat replacement colours —
                      the squares keep reading as a board underneath them. */}
                  {isLast ? <View style={styles.washLast} /> : null}
                  {isSelected ? <View style={styles.washSelected} /> : null}
                  {index === checkIndex ? (
                    <Animated.View
                      style={[
                        styles.washCheck,
                        { opacity: checkPulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) },
                      ]}
                    />
                  ) : null}
                  {showRank ? (
                    <Text
                      style={[
                        styles.coord,
                        styles.coordRank,
                        light ? styles.coordOnLight : styles.coordOnDark,
                      ]}
                    >
                      {square[1]}
                    </Text>
                  ) : null}
                  {showFile ? (
                    <Text
                      style={[
                        styles.coord,
                        styles.coordFile,
                        light ? styles.coordOnLight : styles.coordOnDark,
                      ]}
                    >
                      {square[0]}
                    </Text>
                  ) : null}
                  {mode === '2d' && piece && !hideForSlide ? (
                    <ChessPieceSvg type={piece.type} color={piece.color} size={pieceSize} />
                  ) : null}
                  {isTarget ? (
                    piece ? (
                      <View style={styles.captureRing} />
                    ) : (
                      <View style={styles.moveDot} />
                    )
                  ) : null}
                </Pressable>
              );
            })}

            {mode === '2d' && slide ? (
              <SlidingPiece
                piece={slide.piece}
                from={visualPos(slide.fromIdx, flip)}
                to={visualPos(slide.toIdx, flip)}
                cellPx={cellPx}
                pieceSize={pieceSize}
                progress={slideAnim}
              />
            ) : null}
          </View>
        </View>
      </View>

      {/* ── YOUR STRIP ──────────────────────────────────────────────── */}
      <PlayerStrip {...seats.bottom} position="bottom" />

      {/* ── MOVE TAPE ───────────────────────────────────────────────── */}
      <View style={styles.tape}>
        <Text style={styles.tapeLabel}>MOVES</Text>
        <ScrollView
          ref={tapeRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tapeRow}
        >
          {chess.history.length === 0 ? (
            <Text style={styles.tapeEmpty}>Game ready. Tap a piece to move.</Text>
          ) : (
            chess.history.map((record, i) => (
              <View
                key={`${record.san}-${i}`}
                style={[styles.moveChip, i === chess.history.length - 1 && styles.moveChipLatest]}
              >
                <Text
                  style={[
                    styles.moveChipText,
                    i === chess.history.length - 1 && styles.moveChipTextLatest,
                  ]}
                >
                  {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}
                  {record.san}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <ToolbarButton
          label="Flip"
          path={PATH_FLIP}
          tint={C.sky}
          onPress={() => setManualFlip((v) => !v)}
        />
        <ToolbarButton
          label="Rules"
          path={PATH_INFO}
          tint={C.emerald}
          onPress={() => setRulesOpen(true)}
        />
        <ToolbarButton
          label="Leave"
          path={PATH_EXIT}
          tint={C.rose}
          onPress={onLeave}
          disabled={!onLeave}
        />
      </View>

      {/* ── PAWN PROMOTION ──────────────────────────────────────────── */}
      <Modal visible={!!pendingPromotion} transparent animationType="fade" onRequestClose={() => setPendingPromotion(null)}>
        <View style={styles.scrim}>
          <View style={[styles.card, styles.cardAmber]}>
            <Text style={styles.cardTitle}>Pawn Promotion</Text>
            <Text style={styles.cardSub}>Choose a piece to promote your pawn</Text>
            <View style={styles.promotionRow}>
              {PROMOTIONS.map((promotion) => (
                <Pressable
                  key={promotion}
                  style={styles.promotionBtn}
                  onPress={() => {
                    if (!pendingPromotion) return;
                    onMove(pendingPromotion.from, pendingPromotion.to, promotion);
                    setPendingPromotion(null);
                    setSelected(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Promote to ${PROMOTION_LABEL[promotion]}`}
                >
                  <ChessPieceSvg
                    type={promotion}
                    color={chess.yourColor ?? 'w'}
                    size={36}
                  />
                  <Text style={styles.promotionLabel}>{PROMOTION_LABEL[promotion]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── RESULT ──────────────────────────────────────────────────── */}
      <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setResultDismissed(true)}>
        <View style={styles.scrim}>
          <View style={[styles.card, styles.cardAmber, styles.cardCentered]}>
            <View style={styles.resultBadge}>
              <CrownIcon size={30} />
            </View>
            <Text style={styles.cardTitle}>{resultTitle}</Text>
            <Text style={styles.cardSub}>
              {END_DETAIL[chess.endReason ?? ''] ?? 'The game is over.'}
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setResultDismissed(true)}
              accessibilityRole="button"
              accessibilityLabel="Inspect the board"
            >
              <Text style={styles.primaryBtnText}>Inspect Board</Text>
            </Pressable>
            {onLeave ? (
              <Pressable
                style={styles.ghostBtn}
                onPress={onLeave}
                accessibilityRole="button"
                accessibilityLabel="Back to games"
              >
                <Text style={styles.ghostBtnText}>Back to Games</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── RULES ───────────────────────────────────────────────────── */}
      <Modal visible={rulesOpen} transparent animationType="fade" onRequestClose={() => setRulesOpen(false)}>
        <View style={styles.scrim}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Rules &amp; Controls</Text>
              <Pressable
                onPress={() => setRulesOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close rules"
              >
                <LineIcon d={PATH_CLOSE} size={18} />
              </Pressable>
            </View>
            {[
              'Full FIDE rules: castling both sides, en passant, promotion, check, checkmate, stalemate, threefold repetition and the fifty-move rule.',
              'Tap one of your pieces, then tap a glowing square to move. A ring round a square means a capture.',
              'Switch between the 3D view and the 2D board at any time — the game carries on either way.',
              'Flip turns the board round so you can read the position from the other side.',
            ].map((line) => (
              <View key={line} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setRulesOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={styles.primaryBtnText}>Got It</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ToolbarButton({
  label,
  path,
  tint,
  onPress,
  disabled,
}: {
  label: string;
  path: string;
  tint: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.toolBtn,
        pressed && styles.toolBtnPressed,
        disabled && styles.toolBtnDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LineIcon d={path} size={16} color={tint} />
      <Text style={styles.toolBtnText}>{label}</Text>
    </Pressable>
  );
}

/** Ghost piece that glides from one square to another over the static grid. */
function SlidingPiece({
  piece,
  from,
  to,
  cellPx,
  pieceSize,
  progress,
}: {
  piece: ChessPiece;
  from: { row: number; col: number };
  to: { row: number; col: number };
  cellPx: number;
  pieceSize: number;
  progress: Animated.Value;
}) {
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [from.col * cellPx, to.col * cellPx],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [from.row * cellPx, to.row * cellPx],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.slidingPiece,
        {
          width: cellPx,
          height: cellPx,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    >
      <ChessPieceSvg type={piece.type} color={piece.color} size={pieceSize} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.abyss },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  brandBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.amberSoft,
    borderWidth: 1,
    borderColor: C.amberEdge,
  },
  brandText: { flexShrink: 1 },
  wordmark: {
    fontFamily: DISPLAY_FONT,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: C.amberText,
  },
  wordmarkSub: { fontSize: 10, color: C.muted, fontWeight: '500', marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 12,
    backgroundColor: C.deep,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  segmentBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9 },
  segmentBtnOn: { backgroundColor: C.amber },
  segmentText: { fontSize: 11, fontWeight: '700', color: C.muted },
  segmentTextOn: { color: C.abyss },

  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.7)',
    gap: 10,
  },
  playerBarTop: { borderBottomWidth: 1, borderBottomColor: 'rgba(30,41,59,0.8)' },
  playerBarBottom: { borderTopWidth: 1, borderTopColor: 'rgba(30,41,59,0.8)' },
  playerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  turnDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#475569' },
  // The side to move glows — whose turn it is should be readable without
  // parsing a sentence.
  turnDotLive: {
    backgroundColor: C.emerald,
    shadowColor: C.emerald,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  colorTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: C.dim },
  playerName: { fontSize: 12, fontWeight: '700', color: '#cbd5e1', flexShrink: 1 },
  playerNameLive: { color: C.text },
  lead: { fontSize: 11, fontWeight: '800', color: C.emerald },
  capturedScroll: { maxWidth: '45%' },
  capturedRow: { flexDirection: 'row', alignItems: 'center', gap: 1, minHeight: 18 },

  arena: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.deep,
    overflow: 'hidden',
  },
  statusPill: {
    position: 'absolute',
    top: 10,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  statusPillLive: { borderColor: 'rgba(52,211,153,0.45)' },
  statusPillAlert: { borderColor: 'rgba(239,68,68,0.55)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#e2e8f0' },
  statusDotLive: { backgroundColor: C.emerald },
  statusDotAlert: { backgroundColor: '#ef4444' },
  statusText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, color: C.text },
  statusTextAlert: { color: '#fca5a5' },

  canvas: { width: '100%', flex: 1 },
  // A thick slate frame with a deep drop shadow, so the board sits on the
  // dark arena like a physical set rather than a flat sprite.
  boardFrame: {
    borderWidth: 6,
    borderColor: C.frame,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  // In 3D the scene is the thing you look at; the grid below it is a control
  // strip and should not compete for attention.
  boardFrameCompact: { borderWidth: 3, marginBottom: 8, opacity: 0.94 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  cellLight: { backgroundColor: C.squareLight },
  cellDark: { backgroundColor: C.squareDark },
  washLast: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(56,189,248,0.42)',
  },
  washSelected: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,158,11,0.72)',
  },
  washCheck: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(220,38,38,0.85)',
  },
  // A dot in the middle reads as "move here", a ring round the edge as
  // "take this" — the same language every chess app uses.
  moveDot: {
    position: 'absolute',
    width: '28%',
    height: '28%',
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.75)',
  },
  captureRing: {
    position: 'absolute',
    top: '8%',
    left: '8%',
    right: '8%',
    bottom: '8%',
    borderRadius: 999,
    borderWidth: 4,
    borderColor: 'rgba(239,68,68,0.85)',
  },
  coord: { position: 'absolute', fontSize: 9, fontWeight: '800' },
  coordRank: { top: 2, left: 3 },
  coordFile: { bottom: 1, right: 3 },
  coordOnLight: { color: '#7c583c' },
  coordOnDark: { color: '#e2d5c1' },
  slidingPiece: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.abyss,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,41,59,0.8)',
  },
  tapeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: C.dim },
  tapeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  tapeEmpty: { fontSize: 11, fontStyle: 'italic', color: '#475569' },
  moveChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  moveChipLatest: { backgroundColor: C.amberSoft, borderColor: C.amberEdge },
  moveChipText: { fontFamily: MONO_FONT, fontSize: 11, color: '#cbd5e1' },
  moveChipTextLatest: { color: C.amberText, fontWeight: '700' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  toolBtnPressed: { backgroundColor: '#334155', transform: [{ scale: 0.97 }] },
  toolBtnDisabled: { opacity: 0.4 },
  toolBtnText: { fontSize: 12, fontWeight: '700', color: '#e2e8f0' },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.97)',
    borderWidth: 1,
    borderColor: C.frame,
    gap: 10,
  },
  cardAmber: { borderColor: C.amberEdge },
  cardCentered: { alignItems: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: {
    fontFamily: DISPLAY_FONT,
    fontSize: 18,
    fontWeight: '700',
    color: C.amberText,
  },
  cardSub: { fontSize: 12, color: C.muted, textAlign: 'center' },
  resultBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderWidth: 1,
    borderColor: C.amberEdge,
    marginBottom: 2,
  },
  promotionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  promotionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  promotionLabel: { fontSize: 10, color: C.muted, fontWeight: '600' },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.amber,
    marginTop: 6,
  },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#cbd5e1' },
  primaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: C.amber,
    marginTop: 6,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '800', color: C.abyss },
  ghostBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.9)',
  },
  ghostBtnText: { fontSize: 12, fontWeight: '700', color: '#cbd5e1' },
});
