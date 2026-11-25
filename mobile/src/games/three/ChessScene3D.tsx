import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ChessColor,
  ChessPiece,
  ChessPieceType,
  chessSquareToIndex,
} from '../../api/games';

/**
 * 3D chess board.
 *
 * Pieces are built from primitives rather than loaded models: a model file
 * would be a multi-megabyte asset to download and parse on a mid-range phone,
 * for a board you look at from one fixed angle. Each piece is a stack of
 * lathe/cylinder shapes with a distinct silhouette, which is what actually
 * matters for telling them apart at this size.
 */

/**
 * Pulled back from [0, 7.4, 6.2] / fov 42: at that framing the near rank sat
 * right on the bottom edge of the canvas and the closest pieces were cropped
 * in half. This keeps the same viewing angle but leaves margin around the
 * whole board.
 */
export const CHESS_CAMERA = {
  position: [0, 8.6, 7.4] as [number, number, number],
  fov: 44,
  near: 0.1,
  far: 60,
};

/** One board square, in world units. */
const SQ = 1;
const LIGHT_SQUARE = '#eadbba';
const DARK_SQUARE = '#6f5138';
const FRAME = '#2f2017';
const WHITE_PIECE = '#efe4cc';
const BLACK_PIECE = '#33241c';
const SELECT = '#f5c451';
const TARGET = '#4ade80';
const LAST_MOVE = '#60a5fa';

/**
 * Piece silhouettes as lathe profiles — `[radius, height]` pairs revolved
 * around the Y axis, which is literally how a real set is turned on a lathe.
 *
 * The pieces used to be stacks of whole primitives (a cylinder with a sphere
 * on top for a pawn, a cone for a bishop), which read as "blobs on bases"
 * rather than chess pieces. A profile costs exactly the same at runtime —
 * it's still one small generated geometry, no model file to download or
 * parse — but it gives the collar, flare and finial that make each piece
 * recognisable at a glance.
 */
type Profile = [number, number][];

const PAWN: Profile = [
  [0, 0], [0.3, 0], [0.3, 0.05], [0.25, 0.09], [0.18, 0.12],
  [0.11, 0.17], [0.1, 0.26], [0.12, 0.3],
  [0.18, 0.33], [0.15, 0.36],
  [0.175, 0.41], [0.165, 0.47], [0.1, 0.54], [0, 0.57],
];

const ROOK: Profile = [
  [0, 0], [0.33, 0], [0.33, 0.06], [0.27, 0.1], [0.21, 0.14],
  [0.19, 0.22], [0.19, 0.36], [0.22, 0.42],
  [0.28, 0.46], [0.28, 0.56], [0.22, 0.56], [0.22, 0.5], [0, 0.5],
];

const BISHOP: Profile = [
  [0, 0], [0.31, 0], [0.31, 0.055], [0.26, 0.095], [0.18, 0.135],
  [0.115, 0.21], [0.105, 0.31],
  [0.185, 0.35], [0.155, 0.385],
  [0.195, 0.44], [0.175, 0.54], [0.105, 0.63], [0.055, 0.69],
  [0.07, 0.72], [0, 0.76],
];

const KNIGHT_BASE: Profile = [
  [0, 0], [0.32, 0], [0.32, 0.06], [0.26, 0.1], [0.19, 0.14],
  [0.145, 0.21], [0.14, 0.3],
  [0.185, 0.34], [0.16, 0.37], [0, 0.37],
];

const QUEEN: Profile = [
  [0, 0], [0.35, 0], [0.35, 0.065], [0.29, 0.105], [0.2, 0.16],
  [0.135, 0.27], [0.125, 0.41],
  [0.205, 0.47], [0.175, 0.51],
  [0.245, 0.62], [0.225, 0.68],
  [0.12, 0.72], [0.1, 0.76], [0.135, 0.8], [0, 0.85],
];

const KING: Profile = [
  [0, 0], [0.35, 0], [0.35, 0.065], [0.29, 0.105], [0.2, 0.16],
  [0.135, 0.29], [0.125, 0.45],
  [0.205, 0.51], [0.175, 0.55],
  [0.235, 0.66], [0.215, 0.72],
  [0.115, 0.76], [0, 0.79],
];

function toLathePoints(profile: Profile): THREE.Vector2[] {
  return profile.map(([x, y]) => new THREE.Vector2(x, y));
}

/** Built once at module load — stable references so R3F never rebuilds the
 * geometry on a re-render. */
const LATHE: Record<ChessPieceType, THREE.Vector2[]> = {
  p: toLathePoints(PAWN),
  r: toLathePoints(ROOK),
  b: toLathePoints(BISHOP),
  // The knight's turned part stops at the collar; its head is built on top.
  n: toLathePoints(KNIGHT_BASE),
  q: toLathePoints(QUEEN),
  k: toLathePoints(KING),
};

/** Lathe segments: enough to look turned, few enough for a mid-range GPU. */
const LATHE_SEGMENTS = 24;

/**
 * Board index (0 = a8) → world position. `flip` turns the board so the
 * viewer's own pieces are always nearest the camera, the way a physical board
 * is turned around between two people.
 */
export function squareToWorld(
  index: number,
  flip: boolean,
): [number, number, number] {
  const file = index % 8;
  const rank = Math.floor(index / 8);
  const x = (file - 3.5) * SQ;
  const z = (rank - 3.5) * SQ;
  return flip ? [-x, 0, -z] : [x, 0, z];
}

/**
 * `position` changes the instant a move lands on the server (new square), but
 * snapping the mesh straight there is what made moves look like a piece
 * vanishing and reappearing. The group never takes `position` as a JSX prop
 * after mount — instead it glides toward the latest target every frame, so a
 * move reads as a move instead of a teleport. React.memo + the key in
 * ChessScene3D (one stable id per piece, not per square) is what makes this
 * possible: without a stable key this component would unmount/remount at the
 * new square and there would be nothing to animate between.
 */
const PieceMesh = React.memo(
  function PieceMesh({
    piece,
    position,
  }: {
    piece: ChessPiece;
    position: [number, number, number];
  }) {
    const color = piece.color === 'w' ? WHITE_PIECE : BLACK_PIECE;
    // A dark piece under dark studio light reads as a black blob; a little
    // emissive lift keeps its shape visible without washing out the white set.
    const emissive = piece.color === 'w' ? '#000000' : '#0b1020';
    const material = (
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        roughness={0.45}
        metalness={0.12}
      />
    );

    const groupRef = useRef<THREE.Group>(null);
    const initialPosition = useRef(position);
    const target = useMemo(
      () => new THREE.Vector3(position[0], 0, position[2]),
      [position[0], position[2]],
    );

    useEffect(() => {
      // Only ever runs once per mounted piece — place it on its starting
      // square with no glide (there is no "from" the first time it appears).
      const [x, , z] = initialPosition.current;
      groupRef.current?.position.set(x, 0, z);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFrame((_, delta) => {
      const g = groupRef.current;
      if (!g) return;
      if (g.position.distanceToSquared(target) < 0.0004) {
        g.position.copy(target);
        return;
      }
      g.position.lerp(target, Math.min(1, delta * 9));
    });

    return (
      <group ref={groupRef}>
        {/* One turned profile per piece — base, stem, collar and finial all
            in a single geometry, the way the real thing is made. */}
        <mesh castShadow receiveShadow>
          <latheGeometry args={[LATHE[piece.type], LATHE_SEGMENTS]} />
          {material}
        </mesh>
        <PieceDetail type={piece.type}>{material}</PieceDetail>
      </group>
    );
  },
  (prev, next) =>
    prev.piece.type === next.piece.type &&
    prev.piece.color === next.piece.color &&
    prev.position[0] === next.position[0] &&
    prev.position[1] === next.position[1] &&
    prev.position[2] === next.position[2],
);

/** Four blocks round the rook's rim — a lathe can only turn rings, and the
 * notched top is the one feature that says "rook" at a glance. */
const CRENELLATIONS: [number, number][] = [
  [0.24, 0],
  [-0.24, 0],
  [0, 0.24],
  [0, -0.24],
];

/**
 * The parts a lathe can't turn, because they aren't symmetric about the
 * axis: the rook's notches, the knight's head, the king's cross and the
 * queen's crown points. Everything else is already in the profile.
 */
function PieceDetail({
  type,
  children,
}: {
  type: ChessPieceType;
  children: React.ReactNode;
}) {
  switch (type) {
    case 'r':
      return (
        <>
          {CRENELLATIONS.map(([x, z], i) => (
            <mesh key={i} position={[x, 0.59, z]} castShadow>
              <boxGeometry args={[0.13, 0.12, 0.13]} />
              {children}
            </mesh>
          ))}
        </>
      );
    case 'n':
      // A horse in profile: neck leaning forward, muzzle, cheek and two
      // ears. Crude up close, but from the board's viewing angle it reads
      // as a knight rather than the tilted brick it used to be.
      return (
        <>
          <mesh position={[0, 0.5, 0.02]} rotation={[0.26, 0, 0]} castShadow>
            <boxGeometry args={[0.2, 0.34, 0.2]} />
            {children}
          </mesh>
          <mesh position={[0, 0.65, 0.14]} rotation={[0.75, 0, 0]} castShadow>
            <boxGeometry args={[0.18, 0.24, 0.17]} />
            {children}
          </mesh>
          {/* Muzzle */}
          <mesh position={[0, 0.6, 0.26]} rotation={[0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.15, 0.12, 0.16]} />
            {children}
          </mesh>
          {/* Mane down the back of the neck */}
          <mesh position={[0, 0.62, -0.09]} rotation={[-0.3, 0, 0]} castShadow>
            <boxGeometry args={[0.1, 0.3, 0.1]} />
            {children}
          </mesh>
          {/* Ears */}
          <mesh position={[0.06, 0.78, 0.02]} castShadow>
            <coneGeometry args={[0.035, 0.1, 8]} />
            {children}
          </mesh>
          <mesh position={[-0.06, 0.78, 0.02]} castShadow>
            <coneGeometry args={[0.035, 0.1, 8]} />
            {children}
          </mesh>
        </>
      );
    case 'q':
      // Crown points round the flared rim.
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * 0.2, 0.71, Math.sin(a) * 0.2]}
                castShadow
              >
                <sphereGeometry args={[0.045, 10, 10]} />
                {children}
              </mesh>
            );
          })}
        </>
      );
    case 'k':
      return (
        <>
          {/* Cross on top — the king is the tallest piece on the board. */}
          <mesh position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[0.07, 0.24, 0.07]} />
            {children}
          </mesh>
          <mesh position={[0, 0.93, 0]} castShadow>
            <boxGeometry args={[0.2, 0.07, 0.07]} />
            {children}
          </mesh>
        </>
      );
    default:
      return null;
  }
}

const Highlight = React.memo(function Highlight({
  position,
  color,
  opacity,
}: {
  position: [number, number, number];
  color: string;
  opacity: number;
}) {
  return (
    <mesh position={[position[0], 0.012, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[SQ * 0.94, SQ * 0.94]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
});

export function ChessScene3D({
  board,
  flip,
  selected,
  targets,
  lastMove,
}: {
  board: (ChessPiece | null)[];
  /** True when the viewer plays Black, so their side faces the camera. */
  flip: boolean;
  selected: string | null;
  /** Squares the selected piece may move to. */
  targets: string[];
  lastMove: { from: string; to: string } | null;
}) {
  const squares = useMemo(() => {
    const out: { key: string; position: [number, number, number]; light: boolean }[] =
      [];
    for (let i = 0; i < 64; i++) {
      const file = i % 8;
      const rank = Math.floor(i / 8);
      out.push({
        key: `sq-${i}`,
        position: squareToWorld(i, flip),
        light: (file + rank) % 2 === 0,
      });
    }
    return out;
  }, [flip]);

  const targetSet = useMemo(() => new Set(targets), [targets]);

  // Board index alone can't be the piece's React key: the same index holds a
  // different piece before and after a move, so keying on it is what forced
  // every move to unmount the old piece and mount a new one at the
  // destination (an instant jump, nothing to glide between). A stable id per
  // piece — carried across the move via `lastMove` — lets PieceMesh keep its
  // identity (and its mesh/material) and just slide to the new square.
  const pieceIdByIndexRef = useRef<Map<number, string>>(new Map());
  const idSeqRef = useRef(0);
  const pieceEntries = useMemo(() => {
    const map = pieceIdByIndexRef.current;
    if (lastMove) {
      const fromIdx = chessSquareToIndex(lastMove.from);
      const toIdx = chessSquareToIndex(lastMove.to);
      const movingId = map.get(fromIdx);
      if (movingId) {
        map.delete(fromIdx);
        map.delete(toIdx);
        map.set(toIdx, movingId);
      }
    }
    // Reconcile against the real board: give an id to any occupied square we
    // aren't tracking yet (first load, castling's rook, a promoted piece),
    // and drop ids for squares that are no longer occupied (captures).
    const occupied = new Set<number>();
    board.forEach((piece, index) => {
      if (!piece) return;
      occupied.add(index);
      if (!map.has(index)) map.set(index, `pc-${idSeqRef.current++}`);
    });
    for (const index of [...map.keys()]) {
      if (!occupied.has(index)) map.delete(index);
    }
    return [...map.entries()].map(([index, id]) => ({ id, index }));
  }, [board, lastMove]);

  return (
    <>
      <ambientLight intensity={0.62} />
      {/* The key light casts: without a shadow the pieces look pasted onto
          the squares rather than standing on them. */}
      <directionalLight
        position={[4, 9, 5]}
        intensity={1.25}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={24}
      />
      <directionalLight position={[-5, 6, -4]} intensity={0.32} />

      {/* Table surround, so the board does not float in a void. */}
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#141820" roughness={0.95} />
      </mesh>

      {/* A real board has thickness and a border the coordinates sit on —
          flat planes on their own read as a printed mat. */}
      <mesh position={[0, -0.13, 0]} receiveShadow>
        <boxGeometry args={[9.1, 0.26, 9.1]} />
        <meshStandardMaterial color={FRAME} roughness={0.55} metalness={0.08} />
      </mesh>

      {squares.map((square) => (
        <mesh
          key={square.key}
          position={[square.position[0], 0, square.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[SQ, SQ]} />
          <meshStandardMaterial
            color={square.light ? LIGHT_SQUARE : DARK_SQUARE}
            roughness={0.7}
          />
        </mesh>
      ))}

      {lastMove ? (
        <>
          <Highlight
            position={squareToWorld(chessSquareToIndex(lastMove.from), flip)}
            color={LAST_MOVE}
            opacity={0.3}
          />
          <Highlight
            position={squareToWorld(chessSquareToIndex(lastMove.to), flip)}
            color={LAST_MOVE}
            opacity={0.42}
          />
        </>
      ) : null}

      {selected ? (
        <Highlight
          position={squareToWorld(chessSquareToIndex(selected), flip)}
          color={SELECT}
          opacity={0.6}
        />
      ) : null}

      {[...targetSet].map((square) => (
        <Highlight
          key={`t-${square}`}
          position={squareToWorld(chessSquareToIndex(square), flip)}
          color={TARGET}
          opacity={0.45}
        />
      ))}

      {pieceEntries.map(({ id, index }) => {
        const piece = board[index];
        if (!piece) return null;
        return (
          <PieceMesh key={id} piece={piece} position={squareToWorld(index, flip)} />
        );
      })}
    </>
  );
}

/** Exported for the board's hit-testing maths; kept with the layout it mirrors. */
export const CHESS_SQUARE_SIZE = SQ;
export { THREE };
