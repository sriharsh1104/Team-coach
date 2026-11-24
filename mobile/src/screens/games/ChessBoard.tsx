import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StatusBar, Text, View } from 'react-native';
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

  const [gridSize, setGridSize] = useState(0);
  const cellPx = gridSize / 8;

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

  const content = (
    <View style={fullscreen ? styles.rootFull : styles.root}>
      <View style={styles.statusRow}>
        <Text
          style={[styles.status, styles.statusFlex, chess.inCheck && styles.statusAlert]}
        >
          {status}
        </Text>
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

      {/* The tap grid is always rendered: in 3D it sits under the canvas as
          the control surface, because hit-testing a GL scene on a phone is
          far less reliable than tapping a plain 8×8 of Views. */}
      <View
        style={[styles.grid, mode === '3d' && styles.gridCompact]}
        onLayout={(e) => setGridSize(e.nativeEvent.layout.width)}
      >
        {order.map((index) => {
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
          return (
            <Pressable
              key={square}
              style={[
                styles.cell,
                light ? styles.cellLight : styles.cellDark,
                isLast && styles.cellLast,
                isSelected && styles.cellSelected,
              ]}
              onPress={() => tap(square)}
              accessibilityRole="button"
              accessibilityLabel={`${square}${piece ? `, ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ', empty'}`}
            >
              {mode === '2d' && piece && !hideForSlide ? (
                <Text
                  style={[
                    styles.glyph,
                    piece.color === 'w' ? styles.glyphWhite : styles.glyphBlack,
                  ]}
                >
                  {GLYPH[piece.type][piece.color]}
                </Text>
              ) : null}
              {isTarget ? (
                <View
                  style={[
                    styles.dot,
                    piece ? styles.dotCapture : null,
                    { borderColor: colors.chrome },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}

        {mode === '2d' && slide && cellPx > 0 ? (
          <SlidingPiece
            piece={slide.piece}
            from={visualPos(slide.fromIdx, flip)}
            to={visualPos(slide.toIdx, flip)}
            cellPx={cellPx}
            progress={slideAnim}
            styles={styles}
          />
        ) : null}
      </View>

      <CapturedTray captured={chess.captured} styles={styles} />

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
        <Text style={styles.moves} numberOfLines={2}>
          {chess.history
            .slice(-6)
            .map((record) => record.san)
            .join('  ')}
        </Text>
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
  progress,
  styles,
}: {
  piece: ChessPiece;
  from: { row: number; col: number };
  to: { row: number; col: number };
  cellPx: number;
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
          piece.color === 'w' ? styles.glyphWhite : styles.glyphBlack,
        ]}
      >
        {GLYPH[piece.type][piece.color]}
      </Text>
    </Animated.View>
  );
}

function CapturedTray({
  captured,
  styles,
}: {
  captured: { w: ChessPieceType[]; b: ChessPieceType[] };
  styles: ReturnType<typeof chessStyles>;
}) {
  if (captured.w.length === 0 && captured.b.length === 0) return null;
  return (
    <View style={styles.trayRow}>
      <Text style={styles.tray} numberOfLines={1}>
        {captured.w.map((type) => GLYPH[type].b).join(' ')}
      </Text>
      <Text style={styles.tray} numberOfLines={1}>
        {captured.b.map((type) => GLYPH[type].w).join(' ')}
      </Text>
    </View>
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
    statusFlex: { flex: 1 },
    expandBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
    },
    status: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
    },
    statusAlert: { color: c.danger },
    canvas: { width: '100%' as const, aspectRatio: 1.15 },
    canvasFull: { width: '100%' as const, flex: 1 },
    grid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      aspectRatio: 1,
      width: '100%' as const,
      borderRadius: 12,
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: c.border,
    },
    // In 3D the scene is the thing you look at; the grid shrinks to a
    // control strip rather than competing with it for the screen.
    gridCompact: { aspectRatio: 1, opacity: 0.9 },
    cell: {
      width: '12.5%' as const,
      aspectRatio: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    cellLight: { backgroundColor: '#d9c7a7' },
    cellDark: { backgroundColor: '#6b4f3a' },
    cellLast: { backgroundColor: '#8aa8c8' },
    cellSelected: { backgroundColor: '#e3b84f' },
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
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
    },
    // A ring round the edge of the square reads as "take this", a dot in the
    // middle as "move here" — the same language every chess app uses.
    dotCapture: {
      width: '80%' as const,
      height: '80%' as const,
      borderRadius: 999,
      backgroundColor: 'transparent',
    },
    trayRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
    tray: { color: c.textMuted, fontSize: 16, flex: 1 },
    moves: {
      color: c.textDim,
      fontSize: 12,
      textAlign: 'center' as const,
      fontVariant: ['tabular-nums'] as never,
    },
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
