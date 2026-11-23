import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ChessPiece,
  ChessPieceType,
  ChessPromotion,
  RoomView,
  chessIndexToSquare,
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

  return (
    <View style={styles.root}>
      <Text style={[styles.status, chess.inCheck && styles.statusAlert]}>
        {status}
      </Text>

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

      {/* The tap grid is always rendered: in 3D it sits under the canvas as
          the control surface, because hit-testing a GL scene on a phone is
          far less reliable than tapping a plain 8×8 of Views. */}
      <View style={[styles.grid, mode === '3d' && styles.gridCompact]}>
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
              {mode === '2d' && piece ? (
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
    status: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
    },
    statusAlert: { color: c.danger },
    canvas: { width: '100%' as const, aspectRatio: 1.15 },
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
