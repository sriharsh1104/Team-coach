import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RacePublicState } from '../../api/games';
import {
  FlatMesh,
  boltMesh,
  circleMesh,
  disposeTree,
  flatMesh,
  flushStrip,
  makeStrip,
  pixelTextMesh,
  roundedMesh,
  setOrder,
  setQuad,
  setQuadColor,
  worldX,
  worldY,
} from './glKit';
import { RaceWorld } from './raceWorld';
import {
  LANES,
  curveOffsetAtY,
  distAtY,
  laneCenterX,
  roadWidth,
  screenYOf,
} from './raceGeometry';

/**
 * The racer's renderer: a flat GL scene driven from the interpolated world.
 *
 * Everything is built once into a plain three.js group and then *mutated*
 * each frame — no React state, no re-renders, nothing crossing the bridge
 * while the race is running. At sixty frames a second, a hundred animated
 * nodes diffed through React is exactly what makes a phone stutter.
 *
 * One world unit is one screen pixel and the camera is orthographic, so the
 * arcade's original coordinates carry over unchanged, with the single flip
 * that y grows upward here and downward on a canvas.
 */

/** Horizontal slices the road is built from — more rows, smoother bend. */
const ROWS = 44;
const SPARK_POOL = 56;
const CAR_POOL = 8;
const PAD_POOL = 4;
/** Traffic colours are per slot and never change, so they never go on the wire. */
const CAR_COLORS = ['#f59e0b', '#64748b', '#ec4899', '#14b8a6'];

type Spark = { x: number; y: number; vx: number; vy: number; life: number };

type BikeParts = {
  group: THREE.Group;
  spin: THREE.Group;
  flame: FlatMesh;
  flameCore: FlatMesh;
  strike: FlatMesh;
  hpFill: FlatMesh;
  /** Smoothed screen x and lean, kept here rather than in the world model. */
  x: number;
  lean: number;
  wipeSpin: number;
};

function buildBike(seat: RacePublicState['seats'][number]): BikeParts {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  spin.scale.setScalar(1.32);
  group.add(spin);

  const flame = flatMesh(12, 30, '#38bdf8', 0.85);
  flame.position.set(0, -41, -0.2);
  const flameCore = flatMesh(6, 16, '#facc15', 0.95);
  flameCore.position.set(0, -34, -0.1);

  const tyreRear = flatMesh(8, 13, '#090d16');
  tyreRear.position.set(0, -21.5, 0);
  const tyreFront = flatMesh(8, 13, '#090d16');
  tyreFront.position.set(0, 21.5, 0);

  const chassis = roundedMesh(16, 36, 5, seat.color);
  const bars = flatMesh(28, 4, '#cbd5e1');
  bars.position.set(0, 10, 0.1);

  const strike = flatMesh(28, 8, '#facc15');
  strike.position.set(0, 0, 0.3);
  strike.visible = false;

  const jacket = roundedMesh(18, 16, 4, '#1e293b');
  jacket.position.set(0, -4, 0.2);

  const helmet = circleMesh(7.5, seat.helmet);
  helmet.position.set(0, -2, 0.3);

  const hpBg = flatMesh(36, 4, '#000000', 0.65);
  hpBg.position.set(0, 40, 0.3);
  const hpFill = flatMesh(36, 4, '#22c55e');
  hpFill.position.set(0, 40, 0.4);

  // Who is who at a glance: P1–P4 for the humans, the handle for a CPU.
  const label = pixelTextMesh(seat.tag, 1.5, '#ffffff');
  label.position.set(0, 48, 0.4);

  spin.add(
    flame,
    flameCore,
    tyreRear,
    tyreFront,
    chassis,
    bars,
    strike,
    jacket,
    helmet,
    hpBg,
    hpFill,
    label,
  );
  return { group, spin, flame, flameCore, strike, hpFill, x: 0, lean: 0, wipeSpin: 0 };
}

function buildCar(color: string) {
  const group = new THREE.Group();
  group.scale.setScalar(1.25);
  const wheelsL = flatMesh(5, 36, '#090d16');
  wheelsL.position.set(-17.5, 0, 0);
  const wheelsR = flatMesh(5, 36, '#090d16');
  wheelsR.position.set(17.5, 0, 0);
  const body = roundedMesh(32, 56, 8, color);
  body.position.set(0, 0, 0.1);
  const windshield = flatMesh(24, 14, '#0f172a');
  windshield.position.set(0, 7, 0.2);
  group.add(wheelsL, wheelsR, body, windshield);
  return group;
}

export function RaceScene3D({
  world,
  seats,
  seed,
  finishDist,
}: {
  world: RaceWorld;
  seats: RacePublicState['seats'];
  seed: number;
  finishDist: number;
}) {
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  /** Sparks are pure decoration, so they live and die on the client. */
  const sparks = useRef<Spark[]>([]);

  const kit = useMemo(() => {
    const root = new THREE.Group();

    const backdrop = flatMesh(1, 1, '#064e3b');
    backdrop.position.z = -8;
    backdrop.renderOrder = 0;
    root.add(backdrop);

    const asphalt = makeStrip(ROWS);
    asphalt.mesh.position.z = -6;
    asphalt.mesh.renderOrder = 1;
    const curbs = makeStrip(ROWS * 2);
    curbs.mesh.position.z = -5.8;
    curbs.mesh.renderOrder = 2;
    const dashes = makeStrip(ROWS * (LANES - 1), 0.35);
    dashes.mesh.position.z = -5.6;
    dashes.mesh.renderOrder = 3;
    const finishLine = makeStrip(1, 0.95);
    finishLine.mesh.position.z = -5.4;
    finishLine.mesh.renderOrder = 4;
    root.add(asphalt.mesh, curbs.mesh, dashes.mesh, finishLine.mesh);

    const pads = Array.from({ length: PAD_POOL }, () => {
      const group = new THREE.Group();
      group.scale.setScalar(1.25);
      const ring = roundedMesh(40, 40, 9, '#38bdf8', 0.9);
      ring.position.z = -0.1;
      const plate = roundedMesh(36, 36, 8, '#0c4a6e', 0.95);
      const bolt = boltMesh(1.1, '#facc15');
      bolt.position.z = 0.1;
      group.add(ring, plate, bolt);
      setOrder(group, 5);
      root.add(group);
      return group;
    });

    const cars = Array.from({ length: CAR_POOL }, (_, i) => {
      const group = buildCar(CAR_COLORS[i % CAR_COLORS.length]);
      setOrder(group, 6);
      root.add(group);
      return group;
    });

    const sparkMeshes = Array.from({ length: SPARK_POOL }, () => {
      const mesh = circleMesh(3.5, '#facc15');
      mesh.position.z = 3;
      mesh.renderOrder = 9;
      mesh.visible = false;
      root.add(mesh);
      return mesh;
    });

    // Everything here is moved or rewritten every frame, so the bounding
    // volumes three measured once — at the origin, before anything had moved
    // — go stale immediately, and culling against them can blank the road or
    // a bike for no reason. There are only a hundred-odd meshes: drawing
    // them all is cheaper than keeping those volumes honest.
    root.traverse((object) => {
      object.frustumCulled = false;
    });
    return { root, backdrop, asphalt, curbs, dashes, finishLine, pads, cars, sparkMeshes };
  }, []);

  const bikes = useMemo(() => {
    const built = seats.map((seat) => {
      const parts = buildBike(seat);
      parts.group.traverse((object) => {
        object.frustumCulled = false;
      });
      setOrder(parts.group, 8);
      kit.root.add(parts.group);
      return parts;
    });
    return built;
  }, [kit, seats]);

  useEffect(
    () => () => {
      for (const parts of bikes) {
        kit.root.remove(parts.group);
        disposeTree(parts.group);
      }
    },
    [bikes, kit],
  );

  // Added to the scene by hand rather than through <primitive>: the group is
  // built once and mutated, so it never wants to take part in reconciliation.
  // The teardown releases the GL buffers a restart would otherwise leak.
  useEffect(() => {
    scene.add(kit.root);
    return () => {
      scene.remove(kit.root);
      disposeTree(kit.root);
    };
  }, [scene, kit]);

  useEffect(() => {
    kit.backdrop.scale.set(size.width, size.height, 1);
  }, [size.width, size.height, kit]);

  const red = useMemo(() => new THREE.Color('#ef4444'), []);
  const white = useMemo(() => new THREE.Color('#ffffff'), []);
  const asphaltColor = useMemo(() => new THREE.Color('#1e293b'), []);

  useFrame((_, delta) => {
    const cw = size.width;
    const ch = size.height;
    if (!cw || !ch) return;

    const view = world.sample();
    if (view.empty) return;

    const dt = Math.min(3, Math.max(0.0001, delta * 60));
    const camera = view.cameraDist;
    const roadW = roadWidth(cw);
    const sliceH = ch / ROWS;
    // The kerb stripes scroll with the camera rather than a counter, so they
    // stay put relative to the road however the tick rate wobbles.
    const stripePhase = camera * 0.9;

    // ── Road ────────────────────────────────────────────────────────────
    for (let r = 0; r < ROWS; r++) {
      const yTopCanvas = r * sliceH;
      const yBottomCanvas = yTopCanvas + sliceH + 1;
      const left = (cw - roadW) / 2 + curveOffsetAtY(seed, cw, ch, yTopCanvas, camera);
      const yTop = worldY(ch, yTopCanvas);
      const yBottom = worldY(ch, yBottomCanvas);
      const x0 = worldX(cw, left);
      const x1 = worldX(cw, left + roadW);

      setQuad(kit.asphalt.positions, r, x0, x1, yTop, yBottom);
      setQuadColor(kit.asphalt.colors, r, asphaltColor);

      const dist = distAtY(ch, yTopCanvas, camera);
      const phase = Math.floor((dist + stripePhase) / 24) % 2 === 0;
      const kerb = phase ? red : white;
      setQuad(kit.curbs.positions, r * 2, x0 - 8, x0, yTop, yBottom);
      setQuadColor(kit.curbs.colors, r * 2, kerb);
      setQuad(kit.curbs.positions, r * 2 + 1, x1, x1 + 8, yTop, yBottom);
      setQuadColor(kit.curbs.colors, r * 2 + 1, kerb);

      for (let l = 1; l < LANES; l++) {
        const q = r * (LANES - 1) + (l - 1);
        if (!phase) {
          // Collapse the dash to nothing rather than hiding a whole mesh.
          setQuad(kit.dashes.positions, q, 0, 0, 0, 0);
          setQuadColor(kit.dashes.colors, q, white);
          continue;
        }
        const lx = worldX(cw, left + (roadW / LANES) * l);
        setQuad(
          kit.dashes.positions,
          q,
          lx - 1.5,
          lx + 1.5,
          yTop,
          worldY(ch, yTopCanvas + sliceH * 0.7),
        );
        setQuadColor(kit.dashes.colors, q, white);
      }
    }
    flushStrip(kit.asphalt);
    flushStrip(kit.curbs);
    flushStrip(kit.dashes);

    // ── Finish line, once it comes into view ────────────────────────────
    const finishY = screenYOf(ch, finishDist, camera);
    if (finishY > -40 && finishY < ch + 40) {
      const left = (cw - roadW) / 2 + curveOffsetAtY(seed, cw, ch, finishY, camera);
      setQuad(
        kit.finishLine.positions,
        0,
        worldX(cw, left),
        worldX(cw, left + roadW),
        worldY(ch, finishY - 7),
        worldY(ch, finishY + 7),
      );
      setQuadColor(kit.finishLine.colors, 0, white);
      kit.finishLine.mesh.visible = true;
    } else {
      kit.finishLine.mesh.visible = false;
    }
    flushStrip(kit.finishLine);

    // ── Nitro pads ──────────────────────────────────────────────────────
    kit.pads.forEach((group, i) => {
      const pad = view.pads[i];
      if (!pad) {
        group.visible = false;
        return;
      }
      const y = screenYOf(ch, pad.dist, camera);
      group.visible = y > -60 && y < ch + 60;
      if (!group.visible) return;
      group.position.set(worldX(cw, laneCenterX(seed, cw, ch, pad.lane, y, camera)), worldY(ch, y), 1);
    });

    // ── Traffic ─────────────────────────────────────────────────────────
    kit.cars.forEach((group, i) => {
      const car = view.cars[i];
      if (!car) {
        group.visible = false;
        return;
      }
      const y = screenYOf(ch, car.dist, camera);
      group.visible = y > -90 && y < ch + 90;
      if (!group.visible) return;
      group.position.set(worldX(cw, laneCenterX(seed, cw, ch, car.lane, y, camera)), worldY(ch, y), 1.5);
    });

    // ── Bikes ───────────────────────────────────────────────────────────
    view.riders.forEach((rider, i) => {
      const parts = bikes[i];
      if (!parts) return;
      const y = screenYOf(ch, rider.dist, camera);
      const onScreen = y > -110 && y < ch + 110;
      parts.group.visible = onScreen;
      if (!onScreen) return;

      const clampedY = Math.max(80, Math.min(ch - 80, y));
      const targetX = laneCenterX(seed, cw, ch, rider.lane, clampedY, camera);
      if (parts.x === 0) parts.x = targetX;
      parts.x += (targetX - parts.x) * Math.min(1, 0.24 * dt);
      parts.group.position.set(worldX(cw, parts.x), worldY(ch, y), 2);

      // A downed bike spins; otherwise it leans towards the lane it is
      // heading for and into the bend under it.
      if (rider.down) {
        parts.wipeSpin += 0.32 * dt;
        parts.spin.rotation.z = -parts.wipeSpin;
      } else {
        parts.wipeSpin = 0;
        const drift = (targetX - parts.x) * 0.012;
        parts.lean += (drift - parts.lean) * Math.min(1, 0.14 * dt);
        parts.spin.rotation.z = -parts.lean;
      }

      parts.flame.visible = rider.boosting;
      parts.flameCore.visible = rider.boosting;
      if (rider.boosting) {
        parts.flame.scale.y = 0.8 + Math.random() * 0.5;
        parts.flameCore.scale.y = 0.8 + Math.random() * 0.4;
      }

      if (rider.attack) {
        const reach = rider.attack === 'kick' ? 32 : 24;
        // Swing towards whoever is closest alongside; failing that, inwards.
        const dir = rider.lane < 2 ? 1 : -1;
        parts.strike.visible = true;
        parts.strike.scale.x = reach / 28;
        parts.strike.position.x = dir > 0 ? 6 + reach / 2 : -6 - reach / 2;
        parts.strike.material.color.set(rider.attack === 'kick' ? '#facc15' : '#ffffff');
      } else {
        parts.strike.visible = false;
      }

      const hp = Math.max(0, Math.min(1, rider.hp / 100));
      parts.hpFill.scale.x = hp || 0.001;
      parts.hpFill.position.x = -18 + (36 * hp) / 2;
      parts.hpFill.material.color.set(rider.hp > 35 ? '#22c55e' : '#ef4444');
    });

    // ── Sparks, from whatever the last ticks reported ───────────────────
    for (const event of world.takeFx()) {
      if (event.type !== 'hit' && event.type !== 'crash') continue;
      const seat = event.type === 'hit' ? event.target : event.seat;
      const rider = view.riders[seat];
      if (!rider) continue;
      const hitY = screenYOf(ch, rider.dist, camera);
      const hitX = laneCenterX(seed, cw, ch, rider.lane, hitY, camera);
      for (let i = 0; i < 16; i++) {
        sparks.current.push({
          x: hitX,
          y: hitY,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          life: 20,
        });
      }
    }
    if (sparks.current.length > SPARK_POOL) {
      sparks.current.splice(0, sparks.current.length - SPARK_POOL);
    }

    const live = sparks.current;
    for (let i = live.length - 1; i >= 0; i--) {
      const sp = live[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt;
      if (sp.life <= 0) live.splice(i, 1);
    }
    kit.sparkMeshes.forEach((mesh, i) => {
      const sp = live[i];
      if (!sp) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(worldX(cw, sp.x), worldY(ch, sp.y), 3);
    });
  });

  return null;
}
