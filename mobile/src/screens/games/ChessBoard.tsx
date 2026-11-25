import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from '../../ui/AppIcon';
import {
  ChessPiece,
  ChessPieceType,
  ChessPromotion,
  RoomView,
  chessIndexToSquare,
  chessSquareToIndex,
} from '../../api/games';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { GameCanvas } from '../../games/three/GameCanvas';
import { CHESS_CAMERA, ChessScene3D } from '../../games/three/ChessScene3D';
import { SoftPressable } from '../../ui/SoftPressable';

/** Unicode chess figures — one glyph per piece, no image assets to ship. */
const GLYPH: Record<ChessPieceType, { w: string; b: string }> = {
  k: { w: '♔', b: '♚' },
  q: { w: '♕', b: '♛' },
  r: { w: '♖', b: '♜' },
  b: { w: '♗', b: '♝' },
  n: { w: '♘', b: '♞' },
  p: { w: '♙', b: '♟' },
};

/**
 * Board geometry, in real pixels.
 *
 * The squares used to be `width: '12.5%'` + `aspectRatio: 1` inside a parent
 * that was itself `aspectRatio: 1` with `flexWrap`. Yoga never resolved a
 * height for them from that: every square collapsed to whatever its content
 * needed, so the four empty ranks in the middle rendered at zero height (the
 * 2D board looked squashed into a letterbox) and in 3D — where no glyphs are
 * drawn at all — the whole tap grid collapsed into an empty black square.
 * Deriving one integer cell size from the screen and setting it explicitly,
 * the way BootsBoard already does, is both correct and lets the board be as
 * large as the screen actually allows.
 */
const WINDOW = Dimensions.get('window');
const BOARD_PAD = 12;
function fitBoard(maxWidth: number, maxHeight: number): { cell: number; board: number } {
  const cell = Math.floor(Math.min(maxWidth, maxHeight) / 8);
  return { cell, board: cell * 8 };
}
/** 2D: the board is the screen's main event, so it takes the full width. */
const FLAT = fitBoard(WINDOW.width - BOARD_PAD * 2, WINDOW.height * 0.56);
/** 3D: the same grid is only the tap surface under the scene — it shrinks. */
const MINI = fitBoard(WINDOW.width - BOARD_PAD * 2, WINDOW.height * 0.3);

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

/**
 * One player's line above / below the board: who they are, what they have
 * taken, and how far ahead that puts them. The board alone left the screen
 * feeling empty and gave no sense of who was winning at a glance.
 */
function PlayerStrip({
  name,
  isYou,
  isTurn,
  /** Pieces this player has captured, drawn in the opponent's colour. */
  captured,
  lead,
  styles,
}: {
  name: string;
  isYou: boolean;
  isTurn: boolean;
  captured: { type: ChessPieceType; color: 'w' | 'b' }[];
  lead: number;
  styles: ReturnType<typeof chessStyles>;
}) {
  return (
    <View style={[styles.playerRow, isTurn && styles.playerRowActive]}>
      <View style={[styles.playerAvatar, isTurn && styles.playerAvatarActive]}>
        <Text style={styles.playerAvatarText}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={styles.playerMain}>
        <View style={styles.playerNameRow}>
          <Text style={styles.playerName} numberOfLines={1}>
            {name}
            {/* Skip the suffix when the name already fell back to "You". */}
            {isYou && name !== 'You' ? ' (You)' : ''}
          </Text>
          {isTurn ? <View style={styles.turnDot} /> : null}
        </View>
        <View style={styles.capturedRow}>
          {captured.length > 0 ? (
            <Text style={styles.capturedGlyphs} numberOfLines={1}>
              {captured.map((c) => GLYPH[c.type][c.color]).join('')}
            </Text>
          ) : (
            <Text style={styles.capturedEmpty}>No captures yet</Text>
          )}
          {lead > 0 ? <Text style={styles.lead}>+{lead}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export function ChessBoard({
  room,
  meId,
  busy,
  mode = '2d',
  onFallback,
  onMove,
}: {
  room: RoomView;
  meId: string;
  busy: boolean;
  mode?: '2d' | '3d';
  onFallback?: () => void;
  onMove: (from: string, to: string, promotion?: ChessPromotion) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(chessStyles);
  const chess = room.chess!;
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);

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

  // Black sees the board from their own side, like sitting across a table.
  const flip = chess.yourColor === 'b';
  const order = useMemo(() => {
    const indices = Array.from({ length: 64 }, (_, i) => i);
    return flip ? indices.reverse() : indices;
  }, [flip]);

  // Without this a move just mutated the board data and the whole 8×8
  // re-rendered from scratch — the piece "teleported" instead of moving.
  // This slides a ghost glyph from the old square to the new one on top of
  // the (already-updated) static grid, and hides the static glyph at the
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

  const { cell: cellPx, board: boardPx } = mode === '3d' ? MINI : FLAT;
  const cellSize = useMemo(
    () => ({ width: cellPx, height: cellPx }),
    [cellPx],
  );
  const boardSize = useMemo(
    () => ({ width: boardPx, height: boardPx }),
    [boardPx],
  );
  const glyphSize = useMemo(
    () => ({ fontSize: Math.round(cellPx * 0.72), lineHeight: Math.round(cellPx * 0.86) }),
    [cellPx],
  );

  // Full screen: the 3D scene normally shares the room screen with a status
  // line, the tap grid, captured tray and move history, all stacked in a
  // ScrollView — so the actual board only ever got a fixed, modest slice of
  // the height. This renders the same tree inside a full-screen Modal
  // instead, where the canvas is the one flexible element and can expand
  // into all the space those siblings aren't using.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (mode !== '3d' && fullscreen) setFullscreen(false);
  }, [mode, fullscreen]);

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
      captured: takenByWhite,
      lead: Math.max(0, whiteMaterial - blackMaterial),
    };
    const black = {
      name: nameOf(blackId),
      isYou: blackId === meId,
      isTurn: chess.phase === 'play' && chess.turn === 'b',
      captured: takenByBlack,
      lead: Math.max(0, blackMaterial - whiteMaterial),
    };
    // flip is true when the viewer plays Black, i.e. Black sits at the bottom.
    return flip ? { top: white, bottom: black } : { top: black, bottom: white };
  }, [chess.playerIds, chess.captured, chess.turn, chess.phase, room.players, meId, flip]);

  /** The king that is actually in check, so its square can be lit up. */
  const checkIndex = useMemo(() => {
    if (!chess.inCheck) return -1;
    return chess.board.findIndex(
      (p) => p?.type === 'k' && p.color === chess.turn,
    );
  }, [chess.inCheck, chess.board, chess.turn]);

  const content = (
    <View style={fullscreen ? styles.rootFull : styles.root}>
      <View style={styles.statusRow}>
        <View style={styles.statusFlex}>
          <View
            style={[
              styles.statusPill,
              chess.inCheck && styles.statusPillAlert,
              myTurn && !chess.inCheck && styles.statusPillLive,
            ]}
          >
            {myTurn || chess.inCheck ? (
              <View
                style={[styles.statusDot, chess.inCheck && styles.statusDotAlert]}
              />
            ) : null}
            <Text style={[styles.status, chess.inCheck && styles.statusAlert]}>
              {status}
            </Text>
          </View>
        </View>
        {mode === '3d' ? (
          <Pressable
            onPress={() => setFullscreen((v) => !v)}
            hitSlop={10}
            accessibilityLabel={fullscreen ? 'Exit full screen' : 'Full screen'}
            style={styles.expandBtn}
          >
            <AppIcon name={fullscreen ? 'contract' : 'expand'} size={18} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {mode === '3d' ? (
        <GameCanvas
          style={fullscreen ? styles.canvasFull : styles.canvas}
          camera={CHESS_CAMERA}
          onFallback={onFallback}
          fallback={<View style={fullscreen ? styles.canvasFull : styles.canvas} />}
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

      <PlayerStrip {...seats.top} styles={styles} />

      {/* The tap grid is always rendered: in 3D it sits under the canvas as
          the control surface, because hit-testing a GL scene on a phone is
          far less reliable than tapping a plain 8×8 of Views. */}
      <View style={[styles.grid, boardSize, mode === '3d' && styles.gridCompact]}>
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
          // The destination glyph is suppressed while the ghost piece below
          // is still sliding into it, so the piece doesn't appear twice.
          const hideForSlide = !!slide && slide.toIdx === index;
          // Coordinates only on the edges the eye actually reads from — rank
          // down the left column, file along the bottom row, tucked into the
          // corner of the square so they cost no layout space.
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
              {index === checkIndex ? <View style={styles.washCheck} /> : null}
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
                <Text
                  style={[
                    styles.glyph,
                    glyphSize,
                    piece.color === 'w' ? styles.glyphWhite : styles.glyphBlack,
                  ]}
                >
                  {GLYPH[piece.type][piece.color]}
                </Text>
              ) : null}
              {isTarget ? (
                <View style={[styles.dot, piece ? styles.dotCapture : null]} />
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
            glyphSize={glyphSize}
            progress={slideAnim}
            styles={styles}
          />
        ) : null}
      </View>

      <PlayerStrip {...seats.bottom} styles={styles} />

      {pendingPromotion ? (
        <View style={styles.promotionSheet}>
          <Text style={styles.promotionTitle}>Promote to</Text>
          <View style={styles.promotionRow}>
            {PROMOTIONS.map((promotion) => (
              <SoftPressable
                key={promotion}
                style={styles.promotionBtn}
                onPress={() => {
                  onMove(
                    pendingPromotion.from,
                    pendingPromotion.to,
                    promotion,
                  );
                  setPendingPromotion(null);
                  setSelected(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Promote to ${PROMOTION_LABEL[promotion]}`}
              >
                <Text style={styles.promotionGlyph}>
                  {GLYPH[promotion][chess.yourColor ?? 'w']}
                </Text>
                <Text style={styles.promotionLabel}>
                  {PROMOTION_LABEL[promotion]}
                </Text>
              </SoftPressable>
            ))}
          </View>
        </View>
      ) : null}

      {chess.history.length > 0 ? (
        <View style={styles.moveRow}>
          {chess.history.slice(-5).map((record, i, shown) => (
            <View
              key={`${record.san}-${chess.history.length - shown.length + i}`}
              style={[
                styles.moveChip,
                i === shown.length - 1 && styles.moveChipLatest,
              ]}
            >
              <Text
                style={[
                  styles.moveChipText,
                  i === shown.length - 1 && styles.moveChipTextLatest,
                ]}
              >
                {record.san}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  if (!fullscreen) return content;

  return (
    <Modal
      visible
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={() => setFullscreen(false)}
    >
      <StatusBar hidden />
      {content}
    </Modal>
  );
}

/** Ghost glyph that glides from one square to another over the static grid. */
function SlidingPiece({
  piece,
  from,
  to,
  cellPx,
  glyphSize,
  progress,
  styles,
}: {
  piece: ChessPiece;
  from: { row: number; col: number };
  to: { row: number; col: number };
  cellPx: number;
  glyphSize: { fontSize: number; lineHeight: number };
  progress: Animated.Value;
  styles: ReturnType<typeof chessStyles>;
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
      <Text
        style={[
          styles.glyph,
          glyphSize,
          piece.color === 'w' ? styles.glyphWhite : styles.glyphBlack,
        ]}
      >
        {GLYPH[piece.type][piece.color]}
      </Text>
    </Animated.View>
  );
}

function chessStyles(c: ThemeColors) {
  return {
    root: { gap: 10 },
    // Full screen: no sibling ScrollView fighting it for height, so the
    // canvas below (flex: 1) can actually expand into the space the status
    // row / tap grid / tray / history don't need.
    rootFull: {
      flex: 1,
      gap: 10,
      paddingTop: 36,
      paddingHorizontal: 12,
      paddingBottom: 12,
      backgroundColor: c.bg,
    },
    statusRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    statusFlex: { flex: 1, alignItems: 'center' as const },
    expandBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
    },
    statusPill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    statusPillLive: {
      borderColor: 'rgba(34,197,94,0.55)',
      backgroundColor: 'rgba(34,197,94,0.12)',
    },
    statusPillAlert: {
      borderColor: 'rgba(239,68,68,0.6)',
      backgroundColor: 'rgba(239,68,68,0.14)',
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#22c55e',
    },
    statusDotAlert: { backgroundColor: c.danger },
    status: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800' as const,
      letterSpacing: 0.2,
    },
    statusAlert: { color: c.danger },

    playerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    // The side to move gets the accent — whose turn it is should be readable
    // without parsing a sentence.
    playerRowActive: {
      borderColor: 'rgba(34,197,94,0.5)',
      backgroundColor: 'rgba(34,197,94,0.09)',
    },
    playerAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
    },
    playerAvatarActive: { borderColor: '#22c55e' },
    playerAvatarText: {
      color: c.text,
      fontSize: 13,
      fontWeight: '900' as const,
    },
    playerMain: { flex: 1, minWidth: 0 },
    playerNameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    playerName: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800' as const,
      flexShrink: 1,
    },
    turnDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#22c55e',
    },
    capturedRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginTop: 1,
    },
    capturedGlyphs: {
      color: c.textMuted,
      fontSize: 15,
      flexShrink: 1,
      lineHeight: 19,
    },
    capturedEmpty: { color: c.textDim, fontSize: 11 },
    lead: {
      color: '#22c55e',
      fontSize: 12,
      fontWeight: '900' as const,
    },
    // Taller than wide: the scene is viewed down the board, so the vertical
    // axis is where it needs room — 1.15 was cropping the near rank off the
    // bottom edge.
    canvas: { width: '100%' as const, aspectRatio: 1 },
    canvasFull: { width: '100%' as const, flex: 1 },
    grid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      alignSelf: 'center' as const,
      borderRadius: 10,
      overflow: 'hidden' as const,
      borderWidth: 2,
      borderColor: 'rgba(0,0,0,0.45)',
      // Lifts the board off the page instead of sitting flat on it.
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    // In 3D the scene is the thing you look at; the grid shrinks to a
    // control strip rather than competing with it for the screen.
    gridCompact: { opacity: 0.92 },
    cell: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    cellLight: { backgroundColor: '#eadbba' },
    cellDark: { backgroundColor: '#6f5138' },
    washLast: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(245,196,81,0.34)',
    },
    washSelected: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(245,196,81,0.5)',
      borderWidth: 3,
      borderColor: 'rgba(255,221,128,0.9)',
    },
    washCheck: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(220,38,38,0.42)',
    },
    coord: {
      position: 'absolute' as const,
      fontSize: 9,
      fontWeight: '800' as const,
      opacity: 0.75,
    },
    coordRank: { top: 2, left: 3 },
    coordFile: { bottom: 1, right: 3 },
    coordOnLight: { color: '#6b4f3a' },
    coordOnDark: { color: '#e8d7b6' },
    glyph: { fontSize: 26, lineHeight: 30 },
    slidingPiece: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    glyphWhite: { color: '#fdfdfd' },
    glyphBlack: { color: '#14161c' },
    dot: {
      position: 'absolute' as const,
      // Percentages so the marker tracks the square size instead of looking
      // like a pinhead once the board is drawn at full width.
      width: '28%' as const,
      height: '28%' as const,
      borderRadius: 999,
      borderWidth: 0,
      backgroundColor: 'rgba(24,26,32,0.32)',
    },
    // A ring round the edge of the square reads as "take this", a dot in the
    // middle as "move here" — the same language every chess app uses.
    dotCapture: {
      width: '82%' as const,
      height: '82%' as const,
      borderRadius: 999,
      borderWidth: 4,
      borderColor: 'rgba(24,26,32,0.32)',
      backgroundColor: 'transparent',
    },
    moveRow: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'center' as const,
      gap: 6,
    },
    moveChip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    moveChipLatest: {
      borderColor: c.chrome,
      backgroundColor: 'rgba(201,204,209,0.14)',
    },
    moveChipText: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      fontVariant: ['tabular-nums'] as never,
    },
    moveChipTextLatest: { color: c.text },
    promotionSheet: {
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.chrome,
      gap: 8,
    },
    promotionTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
    },
    promotionRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      gap: 8,
    },
    promotionBtn: {
      flex: 1,
      alignItems: 'center' as const,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    promotionGlyph: { color: c.text, fontSize: 24 },
    promotionLabel: { color: c.textMuted, fontSize: 11, marginTop: 2 },
  };
}
