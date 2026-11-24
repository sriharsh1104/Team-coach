import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { UnoCard, UnoColor } from '../../api/games';

/**
 * Compact 3D Uno table: discard face-up in the middle, a short deck stack,
 * and a gentle idle spin so the board never looks flat/dead.
 */

export const UNO_CAMERA = {
  position: [0, 4.2, 5.4] as [number, number, number],
  fov: 42,
  near: 0.1,
  far: 40,
};

const FACE: Record<UnoColor | 'wild', string> = {
  red: '#dc2626',
  yellow: '#eab308',
  green: '#16a34a',
  blue: '#2563eb',
  wild: '#111827',
};

function CardMesh({
  card,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  activeColor,
}: {
  card: UnoCard | null;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /**
   * Color actually in play, for when `card` is the discard top and it's a
   * wild — `card.color` stays 'wild' forever once played, so without this
   * the one big card everyone looks at renders black no matter what color
   * must be matched.
   */
  activeColor?: UnoColor;
}) {
  const color = card
    ? FACE[card.color === 'wild' ? (activeColor ?? 'wild') : card.color]
    : '#1f2937';
  const label =
    card == null
      ? ''
      : card.rank === 'draw2'
        ? '+2'
        : card.rank === 'wild4'
          ? '+4'
          : card.rank === 'skip'
            ? '⊘'
            : card.rank === 'reverse'
              ? '⇄'
              : card.rank === 'wild'
                ? '★'
                : card.rank;
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.06, 1.55]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.08} />
      </mesh>
      {/* White inset face */}
      <mesh position={[0, 0.035, 0]}>
        <boxGeometry args={[0.92, 0.02, 1.32]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.55} />
      </mesh>
      {/* Center badge */}
      <mesh position={[0, 0.05, 0]}>
        <circleGeometry args={[0.28, 24]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      {/* Tiny label plane (approximation — no text atlas in native R3F) */}
      {label ? (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.22, 0.22]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
        </mesh>
      ) : null}
    </group>
  );
}

function DeckStack({ count }: { count: number }) {
  const n = Math.min(8, Math.max(1, Math.ceil(count / 8)));
  return (
    <group position={[-1.55, 0, 0.15]}>
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[0, i * 0.045, 0]} castShadow>
          <boxGeometry args={[1.05, 0.04, 1.48]} />
          <meshStandardMaterial color="#0f172a" roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

type Props = {
  top: UnoCard | null;
  color: UnoColor;
  deckCount: number;
  direction: 1 | -1;
};

export function UnoScene3D({ top, color, deckCount, direction }: Props) {
  const table = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const accent = useMemo(() => FACE[color], [color]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (table.current) {
      table.current.rotation.y = Math.sin(t * 0.25) * 0.08;
    }
    if (ring.current) {
      ring.current.rotation.z = t * 0.55 * direction;
    }
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 3]} intensity={1.05} castShadow />
      <pointLight position={[-3, 3, -2]} intensity={0.35} color="#93c5fd" />

      <group ref={table}>
        {/* Felt table */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <cylinderGeometry args={[3.2, 3.2, 0.08, 48]} />
          <meshStandardMaterial color="#14532d" roughness={0.85} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[2.55, 2.85, 48]} />
          <meshStandardMaterial color="#052e16" roughness={0.7} />
        </mesh>

        {/* Active color ring */}
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[1.05, 1.22, 40]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={0.35}
            roughness={0.4}
          />
        </mesh>

        <DeckStack count={deckCount} />
        <CardMesh
          card={top}
          position={[0.55, 0.08, 0]}
          rotation={[-0.08, 0.12, 0.04]}
          scale={1.05}
          activeColor={color}
        />
      </group>
    </>
  );
}
