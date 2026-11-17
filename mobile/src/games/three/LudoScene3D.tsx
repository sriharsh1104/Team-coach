import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { LudoColor, LudoState } from '../../api/games';

/**
 * 3D Ludo: the 15×15 board laid flat on the XZ plane (one unit per cell,
 * centred on the origin), pawns that glide to their new square, a dice that
 * tumbles on every roll, and the whole board turned so the viewer's own
 * base sits at the bottom. Geometry is primitives only — no asset loading.
 */

export const LUDO_HEX: Record<LudoColor, string> = {
  red: '#e74c3c',
  green: '#27ae60',
  yellow: '#f1c40f',
  blue: '#2980b9',
};
const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function buildTrack(): Array<[number, number]> {
  const t: Array<[number, number]> = [];
  for (let x = 1; x <= 5; x++) t.push([x, 6]);
  for (let y = 5; y >= 0; y--) t.push([6, y]);
  t.push([7, 0]);
  for (let y = 0; y <= 5; y++) t.push([8, y]);
  for (let x = 9; x <= 14; x++) t.push([x, 6]);
  t.push([14, 7]);
  for (let x = 14; x >= 9; x--) t.push([x, 8]);
  for (let y = 9; y <= 14; y++) t.push([8, y]);
  t.push([7, 14]);
  for (let y = 14; y >= 9; y--) t.push([6, y]);
  for (let x = 5; x >= 0; x--) t.push([x, 8]);
  t.push([0, 7]);
  t.push([0, 6]);
  return t;
}
const TRACK = buildTrack();
const HOME_COL: Record<LudoColor, Array<[number, number]>> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};
const HOME_SEAT: Record<LudoColor, [number, number]> = {
  red: [6.7, 7.5],
  green: [7.5, 6.7],
  yellow: [8.3, 7.5],
  blue: [7.5, 8.3],
};
const BASE_ORIGIN: Record<LudoColor, [number, number]> = {
  red: [0, 0],
  green: [9, 0],
  yellow: [9, 9],
  blue: [0, 9],
};
const BASE_SLOTS: Array<[number, number]> = [[2, 2], [4, 2], [2, 4], [4, 4]];
/** Board rotation (about Y) that brings this colour's base to the bottom-left. */
const VIEW_ROTATION: Record<LudoColor, number> = {
  red: Math.PI / 2,
  green: Math.PI,
  yellow: -Math.PI / 2,
  blue: 0,
};

/** Grid cell centre (col, row) for a token. */
function cellFor(color: LudoColor, step: number, tokenIndex: number): [number, number] {
  if (step < 0) {
    const [bx, by] = BASE_ORIGIN[color];
    const [sx, sy] = BASE_SLOTS[tokenIndex];
    return [bx + sx, by + sy];
  }
  if (step <= 50) {
    const [x, y] = TRACK[(START[color] + step) % 52];
    return [x + 0.5, y + 0.5];
  }
  if (step <= 56) {
    const [x, y] = HOME_COL[color][step - 51];
    return [x + 0.5, y + 0.5];
  }
  return HOME_SEAT[color];
}
/** (col,row) grid → world XZ, board centred on the origin. */
const toWorld = (cx: number, cy: number): [number, number] => [cx - 7.5, cy - 7.5];

// ── Static board ──────────────────────────────────────────────────────────

function Board({ colorsInPlay }: { colorsInPlay: Set<LudoColor> }) {
  const cells = useMemo(() => {
    const out: Array<{ key: string; x: number; z: number; color: string; h: number; w: number; d: number }> = [];
    TRACK.forEach(([x, y], i) => {
      const startColor = (Object.keys(START) as LudoColor[]).find((c) => START[c] === i);
      const color = startColor ? LUDO_HEX[startColor] : SAFE.has(i) ? '#cfd6dd' : '#f6f7f9';
      const [wx, wz] = toWorld(x + 0.5, y + 0.5);
      out.push({ key: `t${i}`, x: wx, z: wz, color, h: 0.16, w: 0.94, d: 0.94 });
    });
    (Object.keys(HOME_COL) as LudoColor[]).forEach((c) =>
      HOME_COL[c].slice(0, 5).forEach(([x, y], i) => {
        const [wx, wz] = toWorld(x + 0.5, y + 0.5);
        out.push({ key: `${c}h${i}`, x: wx, z: wz, color: LUDO_HEX[c], h: 0.16, w: 0.94, d: 0.94 });
      }),
    );
    return out;
  }, []);

  return (
    <group>
      {/* base plate */}
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[15.6, 0.24, 15.6]} />
        <meshStandardMaterial color="#1b1e24" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.0, 0]}>
        <boxGeometry args={[15, 0.02, 15]} />
        <meshStandardMaterial color="#e6e9ee" />
      </mesh>
      {cells.map((c) => (
        <mesh key={c.key} position={[c.x, c.h / 2, c.z]}>
          <boxGeometry args={[c.w, c.h, c.d]} />
          <meshStandardMaterial color={c.color} roughness={0.6} />
        </mesh>
      ))}
      {(Object.keys(BASE_ORIGIN) as LudoColor[]).map((c) => {
        const [bx, by] = BASE_ORIGIN[c];
        const [wx, wz] = toWorld(bx + 3, by + 3);
        const dim = !colorsInPlay.has(c);
        return (
          <group key={c} position={[wx, 0, wz]}>
            <mesh position={[0, 0.12, 0]}>
              <boxGeometry args={[6, 0.24, 6]} />
              <meshStandardMaterial color={LUDO_HEX[c]} roughness={0.55} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, 0.26, 0]}>
              <boxGeometry args={[4.2, 0.06, 4.2]} />
              <meshStandardMaterial color="#fafafa" />
            </mesh>
            {BASE_SLOTS.map(([sx, sy], i) => (
              <mesh key={i} position={[sx - 3, 0.3, sy - 3]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.38, 0.5, 24]} />
                <meshStandardMaterial color={LUDO_HEX[c]} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* centre: four pyramids pointing inwards */}
      {(
        [
          ['red', [-0.75, 0.75], Math.PI / 2],
          ['green', [0, -0.75], Math.PI],
          ['yellow', [0.75, 0.75], -Math.PI / 2],
          ['blue', [0, 0.75], 0],
        ] as Array<[LudoColor, [number, number], number]>
      ).map(([c, [ox, oz]]) => (
        <mesh key={`centre-${c}`} position={[ox * 1, 0.3, oz * 1]}>
          <coneGeometry args={[0.9, 0.5, 4]} />
          <meshStandardMaterial color={LUDO_HEX[c]} />
        </mesh>
      ))}
    </group>
  );
}

// ── Pawn ──────────────────────────────────────────────────────────────────

function Pawn({
  color,
  target,
  movable,
  onPress,
}: {
  color: LudoColor;
  target: [number, number];
  movable: boolean;
  onPress?: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const goal = useRef(new THREE.Vector3(target[0], 0, target[1]));
  useEffect(() => {
    goal.current.set(target[0], 0, target[1]);
  }, [target]);
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    // Glide to the new square; hop a little while travelling.
    const dist = g.position.distanceTo(new THREE.Vector3(goal.current.x, g.position.y, goal.current.z));
    g.position.x += (goal.current.x - g.position.x) * Math.min(1, dt * 9);
    g.position.z += (goal.current.z - g.position.z) * Math.min(1, dt * 9);
    const hop = dist > 0.05 ? Math.min(0.5, dist) * 0.6 : 0;
    const bob = movable ? 0.12 + Math.sin(state.clock.elapsedTime * 7) * 0.08 : 0;
    g.position.y = 0.18 + hop + bob;
  });
  return (
    <group ref={ref} position={[target[0], 0.18, target[1]]} onClick={movable ? onPress : undefined}>
      {movable ? (
        <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.56, 28]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
        </mesh>
      ) : null}
      <mesh castShadow>
        <cylinderGeometry args={[0.34, 0.4, 0.2, 24]} />
        <meshStandardMaterial color={LUDO_HEX[color]} roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.14, 0.24, 0.42, 20]} />
        <meshStandardMaterial color={LUDO_HEX[color]} roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.2, 24, 16]} />
        <meshStandardMaterial color={LUDO_HEX[color]} roughness={0.3} metalness={0.15} />
      </mesh>
    </group>
  );
}

// ── Dice ──────────────────────────────────────────────────────────────────

const PIP_POS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-0.25, -0.25], [0.25, 0.25]],
  3: [[-0.25, -0.25], [0, 0], [0.25, 0.25]],
  4: [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]],
  5: [[-0.25, -0.25], [0.25, -0.25], [0, 0], [-0.25, 0.25], [0.25, 0.25]],
  6: [[-0.25, -0.28], [0.25, -0.28], [-0.25, 0], [0.25, 0], [-0.25, 0.28], [0.25, 0.28]],
};
// Face value → the cube rotation that puts that face on top (+Y).
// Faces: +Y=1, -Y=6, +X=3, -X=4, +Z=2, -Z=5 (opposites sum to 7).
const FACE_UP_ROTATION: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  6: [Math.PI, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  2: [-Math.PI / 2, 0, 0],
  5: [Math.PI / 2, 0, 0],
};

function PipFace({ value, rotation, offset }: { value: number; rotation: [number, number, number]; offset: [number, number, number] }) {
  return (
    <group rotation={rotation} position={offset}>
      {PIP_POS[value].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.01]}>
          <circleGeometry args={[0.07, 16]} />
          <meshStandardMaterial color="#141414" />
        </mesh>
      ))}
    </group>
  );
}

function Dice({ value, version, position, onPress }: { value: number | null; version: number; position: [number, number, number]; onPress?: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const spin = useRef({ t: 1, from: version });
  useEffect(() => {
    if (version !== spin.current.from) {
      spin.current = { t: 0, from: version };
    }
  }, [version]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (spin.current.t < 1) {
      spin.current.t = Math.min(1, spin.current.t + dt * 1.6);
      const k = spin.current.t;
      g.rotation.x += dt * 14 * (1 - k);
      g.rotation.y += dt * 11 * (1 - k);
      g.position.y = position[1] + Math.sin(k * Math.PI) * 1.2;
      if (spin.current.t >= 1 && value) {
        const [rx, ry, rz] = FACE_UP_ROTATION[value];
        g.rotation.set(rx, ry, rz);
        g.position.y = position[1];
      }
    } else if (value) {
      const [rx, ry, rz] = FACE_UP_ROTATION[value];
      g.rotation.x += (rx - g.rotation.x) * 0.2;
      g.rotation.y += (ry - g.rotation.y) * 0.2;
      g.rotation.z += (rz - g.rotation.z) * 0.2;
    } else {
      g.rotation.y += dt * 0.8; // idle: slow turn while waiting for a roll
    }
  });
  const h = 0.5;
  return (
    <group ref={ref} position={position} onClick={onPress}>
      <mesh castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#fdfdfd" roughness={0.4} />
      </mesh>
      <PipFace value={1} rotation={[-Math.PI / 2, 0, 0]} offset={[0, h, 0]} />
      <PipFace value={6} rotation={[Math.PI / 2, 0, 0]} offset={[0, -h, 0]} />
      <PipFace value={3} rotation={[0, Math.PI / 2, 0]} offset={[h, 0, 0]} />
      <PipFace value={4} rotation={[0, -Math.PI / 2, 0]} offset={[-h, 0, 0]} />
      <PipFace value={2} rotation={[0, 0, 0]} offset={[0, 0, h]} />
      <PipFace value={5} rotation={[0, Math.PI, 0]} offset={[0, 0, -h]} />
    </group>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────

type Props = {
  state: LudoState;
  meId: string;
  myTurn: boolean;
  onMove: (tokenIndex: number) => void;
  onRoll: () => void;
};

export function LudoScene3D({ state, meId, myTurn, onMove, onRoll }: Props) {
  const myColor = state.colors[meId] ?? 'blue';
  const current = state.turnOrder[state.turnIndex];
  const currentColor = state.colors[current] ?? 'blue';
  const colorsInPlay = useMemo(() => new Set(Object.values(state.colors)), [state.colors]);

  // Dice floats above the current player's base.
  const [dbx, dby] = BASE_ORIGIN[currentColor];
  const [dx, dz] = toWorld(dbx + 3, dby + 3);

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 4]} intensity={1.1} castShadow />
      <directionalLight position={[-6, 6, -4]} intensity={0.35} />
      <group rotation={[0, VIEW_ROTATION[myColor], 0]}>
        <Board colorsInPlay={colorsInPlay} />
        {state.turnOrder.map((uid) =>
          state.tokens[uid].map((step, i) => {
            const color = state.colors[uid];
            const [cx, cy] = cellFor(color, step, i);
            const [wx, wz] = toWorld(cx, cy);
            const movable = myTurn && uid === meId && state.phase === 'move' && state.movable.includes(i);
            return (
              <Pawn
                key={`${uid}-${i}`}
                color={color}
                target={[wx, wz]}
                movable={movable}
                onPress={movable ? () => onMove(i) : undefined}
              />
            );
          }),
        )}
        <Dice
          value={state.dice}
          version={state.version}
          position={[dx, 1.3, dz]}
          onPress={myTurn && state.phase === 'roll' ? onRoll : undefined}
        />
      </group>
    </>
  );
}

export const LUDO_CAMERA = { position: [0, 15.5, 13.5] as [number, number, number], fov: 42, near: 0.1, far: 100 };
