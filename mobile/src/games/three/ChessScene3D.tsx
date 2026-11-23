import React, { useMemo } from 'react';
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

export const CHESS_CAMERA = {
  position: [0, 7.4, 6.2] as [number, number, number],
  fov: 42,
  near: 0.1,
  far: 60,
};

/** One board square, in world units. */
const SQ = 1;
const LIGHT_SQUARE = '#d9c7a7';
const DARK_SQUARE = '#6b4f3a';
const WHITE_PIECE = '#f3f4f6';
const BLACK_PIECE = '#1f2430';
const SELECT = '#f5c451';
const TARGET = '#4ade80';
const LAST_MOVE = '#60a5fa';

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

  const [x, , z] = position;
  return (
    <group position={[x, 0, z]}>
      {/* Every piece shares a base, so they sit at a consistent height. */}
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.14, 20]} />
        {material}
      </mesh>
      <PieceBody type={piece.type}>{material}</PieceBody>
    </group>
  );
}

/** The part above the base — this is what makes each piece recognisable. */
function PieceBody({
  type,
  children,
}: {
  type: ChessPieceType;
  children: React.ReactNode;
}) {
  switch (type) {
    case 'p':
      return (
        <>
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.13, 0.22, 0.22, 16]} />
            {children}
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            {children}
          </mesh>
        </>
      );
    case 'r':
      return (
        <>
          <mesh position={[0, 0.34, 0]}>
            <cylinderGeometry args={[0.24, 0.27, 0.42, 16]} />
            {children}
          </mesh>
          {/* Crenellations — the one feature that says "rook" instantly. */}
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[0.52, 0.14, 0.52]} />
            {children}
          </mesh>
        </>
      );
    case 'n':
      return (
        <>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.18, 0.26, 0.34, 16]} />
            {children}
          </mesh>
          {/* Angled head, tilted forward so it reads as a horse in profile. */}
          <mesh position={[0, 0.58, 0.06]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.22, 0.4, 0.3]} />
            {children}
          </mesh>
        </>
      );
    case 'b':
      return (
        <>
          <mesh position={[0, 0.34, 0]}>
            <coneGeometry args={[0.24, 0.48, 18]} />
            {children}
          </mesh>
          <mesh position={[0, 0.64, 0]}>
            <sphereGeometry args={[0.1, 14, 14]} />
            {children}
          </mesh>
        </>
      );
    case 'q':
      return (
        <>
          <mesh position={[0, 0.38, 0]}>
            <cylinderGeometry args={[0.16, 0.28, 0.54, 18]} />
            {children}
          </mesh>
          <mesh position={[0, 0.68, 0]}>
            <torusGeometry args={[0.16, 0.05, 10, 20]} />
            {children}
          </mesh>
          <mesh position={[0, 0.8, 0]}>
            <sphereGeometry args={[0.1, 14, 14]} />
            {children}
          </mesh>
        </>
      );
    case 'k':
    default:
      return (
        <>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.17, 0.29, 0.58, 18]} />
            {children}
          </mesh>
          {/* Cross on top — the king is the tallest piece on the board. */}
          <mesh position={[0, 0.78, 0]}>
            <boxGeometry args={[0.1, 0.3, 0.1]} />
            {children}
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <boxGeometry args={[0.26, 0.1, 0.1]} />
            {children}
          </mesh>
        </>
      );
  }
}

function Highlight({
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
}

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

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 9, 5]} intensity={1.15} />
      <directionalLight position={[-5, 6, -4]} intensity={0.35} />

      {/* Table surround, so the board does not float in a void. */}
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11, 11]} />
        <meshStandardMaterial color="#141820" roughness={0.9} />
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

      {board.map((piece, index) =>
        piece ? (
          <PieceMesh
            key={`p-${index}`}
            piece={piece}
            position={squareToWorld(index, flip)}
          />
        ) : null,
      )}
    </>
  );
}

/** Exported for the board's hit-testing maths; kept with the layout it mirrors. */
export const CHESS_SQUARE_SIZE = SQ;
export { THREE };
