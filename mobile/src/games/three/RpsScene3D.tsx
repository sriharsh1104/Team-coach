import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { RpsChoice } from '../../api/games';

/**
 * 3D Stone-Paper-Scissors: two low-poly hands (primitives only) facing each
 * other. While a round resolves they pump three times, then open into the
 * players' picks. `shakeKey` changing starts a new pump sequence.
 */

const SKIN = '#f3c9a0';
const SKIN_DARK = '#d9a77d';

type Pose = RpsChoice | 'fist';

/** Per-finger curl (0 = straight, 1 = fully curled) and spread for each pose. */
function fingerCurl(pose: Pose, finger: number): number {
  switch (pose) {
    case 'paper':
      return 0;
    case 'scissors':
      return finger <= 1 ? 0 : 1;
    default:
      return 1;
  }
}
function fingerSpread(pose: Pose, finger: number): number {
  if (pose === 'scissors') return finger === 0 ? 0.28 : finger === 1 ? -0.28 : 0;
  if (pose === 'paper') return (1.5 - finger) * 0.12;
  return 0;
}

function Finger({ index, pose }: { index: number; pose: Pose }) {
  const base = useRef<THREE.Group>(null);
  const mid = useRef<THREE.Group>(null);
  const curlRef = useRef(fingerCurl(pose, index));
  const spreadRef = useRef(fingerSpread(pose, index));
  useEffect(() => {
    curlRef.current = fingerCurl(pose, index);
    spreadRef.current = fingerSpread(pose, index);
  }, [pose, index]);
  useFrame(() => {
    const b = base.current;
    const m = mid.current;
    if (!b || !m) return;
    const curl = curlRef.current;
    // ease towards target angles
    b.rotation.x += (curl * 1.35 - b.rotation.x) * 0.18;
    b.rotation.z += (spreadRef.current - b.rotation.z) * 0.18;
    m.rotation.x += (curl * 1.6 - m.rotation.x) * 0.18;
  });
  const x = (index - 1.5) * 0.34;
  const len = index === 3 ? 0.55 : index === 0 ? 0.62 : 0.7;
  return (
    <group position={[x, 0.68, 0]}>
      <group ref={base}>
        <mesh position={[0, len / 2, 0]}>
          <capsuleGeometry args={[0.14, len, 6, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
        <group ref={mid} position={[0, len, 0]}>
          <mesh position={[0, 0.26, 0]}>
            <capsuleGeometry args={[0.13, 0.5, 6, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Thumb({ pose }: { pose: Pose }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const open = pose === 'paper' ? 0.9 : 0.25;
    g.rotation.z += (open - g.rotation.z) * 0.18;
    g.rotation.y += ((pose === 'paper' ? 0 : -0.6) - g.rotation.y) * 0.18;
  });
  return (
    <group ref={ref} position={[-0.72, 0.1, 0.1]}>
      <mesh position={[-0.22, 0.2, 0]} rotation={[0, 0, 0.7]}>
        <capsuleGeometry args={[0.15, 0.6, 6, 10]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Hand({ pose, mirrored, pump, dim }: { pose: Pose; mirrored: boolean; pump: number; dim: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    // pump: 0..1 progress of the 3-shake sequence; idle breathing otherwise.
    const shake = pump < 1 ? Math.abs(Math.sin(pump * Math.PI * 3)) * 0.9 : 0;
    const idle = Math.sin(state.clock.elapsedTime * 1.6) * 0.05;
    g.position.y = -0.3 + shake + idle;
    g.rotation.x = -0.35 + shake * 0.25;
    const s = dim ? 0.92 : 1;
    g.scale.setScalar(g.scale.x + (s - g.scale.x) * 0.15);
  });
  return (
    <group ref={ref} position={[mirrored ? -2.1 : 2.1, -0.3, 0]} rotation={[-0.35, mirrored ? 0.55 : -0.55, 0]} scale={mirrored ? [-1, 1, 1] : [1, 1, 1]}>
      {/* wrist */}
      <mesh position={[0, -1.2, 0]}>
        <cylinderGeometry args={[0.55, 0.62, 1.4, 20]} />
        <meshStandardMaterial color={SKIN_DARK} roughness={0.75} />
      </mesh>
      {/* palm */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.5, 1.45, 0.6]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <Finger key={i} index={i} pose={pose} />
      ))}
      <Thumb pose={pose} />
    </group>
  );
}

type Props = {
  /** Pose shown once the shake finishes (fist while picking / hidden). */
  myPose: Pose;
  oppPose: Pose;
  /** Change this value to trigger a 3-pump shake before revealing poses. */
  shakeKey: string;
  /** Called when the shake sequence finishes (to flip the 2D banner). */
  onShakeDone?: () => void;
  winner: 'me' | 'opp' | null;
};

export function RpsScene3D({ myPose, oppPose, shakeKey, onShakeDone, winner }: Props) {
  const pump = useRef(1);
  const lastKey = useRef(shakeKey);
  const shownRef = useRef<{ my: Pose; opp: Pose }>({ my: 'fist', opp: 'fist' });
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (shakeKey !== lastKey.current) {
      lastKey.current = shakeKey;
      pump.current = 0;
      shownRef.current = { my: 'fist', opp: 'fist' };
      force();
    }
  }, [shakeKey]);

  useFrame((_, dt) => {
    if (pump.current < 1) {
      pump.current = Math.min(1, pump.current + dt / 1.1);
      if (pump.current >= 1) {
        shownRef.current = { my: myPose, opp: oppPose };
        force();
        onShakeDone?.();
      }
    } else if (shownRef.current.my !== myPose || shownRef.current.opp !== oppPose) {
      shownRef.current = { my: myPose, opp: oppPose };
      force();
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 5]} intensity={1.2} />
      <directionalLight position={[-4, 2, -3]} intensity={0.4} />
      <mesh position={[0, -2.4, -1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 12]} />
        <meshStandardMaterial color="#15181d" roughness={1} />
      </mesh>
      <Hand pose={shownRef.current.my} mirrored pump={pump.current} dim={winner === 'opp'} />
      <Hand pose={shownRef.current.opp} mirrored={false} pump={pump.current} dim={winner === 'me'} />
    </>
  );
}

export const RPS_CAMERA = { position: [0, 1.4, 7.2] as [number, number, number], fov: 40, near: 0.1, far: 60 };
