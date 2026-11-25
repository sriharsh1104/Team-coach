import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  Biker,
  FINISH_DIST,
  LANES,
  RaceState,
  cameraLeader,
  curveOffsetAtY,
  laneCenterX,
  raceStep,
  resizeRace,
  roadWidth,
  screenYOf,
} from './raceEngine';

/**
 * The racer's renderer: a flat GL scene driven straight from the simulation.
 *
 * Everything is built once into a plain three.js group and then *mutated* each
 * frame — no React state, no re-renders, nothing crossing the bridge while the
 * race is running. That is the whole reason this is a GL scene rather than SVG
 * views: at sixty frames a second, a hundred animated nodes diffed through
 * React is exactly the kind of thing that makes a phone stutter.
 *
 * One world unit is one screen pixel and the camera is orthographic, so every
 * coordinate from the original arcade canvas carries over unchanged, with the
 * single flip that y grows upward here and downward there.
 */

/** Horizontal slices the road is built from — more rows, smoother bend. */
const ROWS = 44;
const SPARK_POOL = 48;

/** Canvas-space y (down) to world y (up). */
function worldY(ch: number, y: number): number {
  return ch / 2 - y;
}
function worldX(cw: number, x: number): number {
  return x - cw / 2;
}

function flatMesh(
  width: number,
  height: number,
  color: string,
  opacity = 1,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    }),
  );
  return mesh;
}

/** A strip of `rows` quads whose corner positions are rewritten every frame. */
function makeStrip(rows: number, color: string, opacity = 1) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(rows * 4 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const index: number[] = [];
  for (let r = 0; r < rows; r++) {
    const o = r * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  geometry.setIndex(index);
  const colors = new Float32Array(rows * 4 * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      vertexColors: true,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    }),
  );
  return { mesh, positions, colors, geometry };
}

/** Write one quad (top-left, top-right, bottom-right, bottom-left) into a strip. */
function setQuad(
  positions: Float32Array,
  quadIndex: number,
  x0: number,
  x1: number,
  yTop: number,
  yBottom: number,
  z: number,
) {
  const o = quadIndex * 12;
  positions[o] = x0;
  positions[o + 1] = yTop;
  positions[o + 2] = z;
  positions[o + 3] = x1;
  positions[o + 4] = yTop;
  positions[o + 5] = z;
  positions[o + 6] = x1;
  positions[o + 7] = yBottom;
  positions[o + 8] = z;
  positions[o + 9] = x0;
  positions[o + 10] = yBottom;
  positions[o + 11] = z;
}

function setQuadColor(colors: Float32Array, quadIndex: number, c: THREE.Color) {
  const o = quadIndex * 12;
  for (let i = 0; i < 4; i++) {
    colors[o + i * 3] = c.r;
    colors[o + i * 3 + 1] = c.g;
    colors[o + i * 3 + 2] = c.b;
  }
}

/**
 * Paint order, applied to every mesh in a subtree.
 *
 * `renderOrder` on a Group does nothing — three sorts the meshes themselves —
 * so a group's order has to be pushed down onto its children.
 */
function setOrder(root: THREE.Object3D, order: number) {
  root.traverse((object) => {
    object.renderOrder = order;
  });
}

/** The lightning bolt stamped on a nitro pad. */
function boltShape(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(2, 9);
  s.lineTo(-4, 1);
  s.lineTo(0, 1);
  s.lineTo(-2, -9);
  s.lineTo(4, -1);
  s.lineTo(0, -1);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

type BikerParts = {
  group: THREE.Group;
  spin: THREE.Group;
  flame: THREE.Mesh;
  flameCore: THREE.Mesh;
  strike: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  helmet: THREE.Mesh;
  hpFill: THREE.Mesh;
};

type CarParts = { group: THREE.Group; body: THREE.MeshBasicMaterial };

/**
 * Builds the bike: two tyres, a chassis in the rider's colour, handlebars, the
 * jacket and helmet, a strike bar that flicks out on a punch or kick, nitro
 * flames, and the little health bar that floats above it.
 */
function buildBiker(b: Biker): BikerParts {
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

  const chassis = flatMesh(16, 36, b.color);
  const bars = flatMesh(28, 4, '#cbd5e1');
  bars.position.set(0, 10, 0.1);

  const strike = flatMesh(28, 8, '#facc15');
  strike.position.set(0, 0, 0.3);
  strike.visible = false;

  const jacket = flatMesh(18, 16, '#1e293b');
  jacket.position.set(0, -4, 0.2);

  const helmet = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 18),
    new THREE.MeshBasicMaterial({ color: b.helmet, depthWrite: false }),
  );
  helmet.position.set(0, -2, 0.3);

  const hpBg = flatMesh(36, 4, '#000000', 0.65);
  hpBg.position.set(0, 40, 0.3);
  const hpFill = flatMesh(36, 4, '#22c55e');
  hpFill.position.set(0, 40, 0.4);

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
  );
  return { group, spin, flame, flameCore, strike, helmet, hpFill };
}

function buildCar(): CarParts {
  const group = new THREE.Group();
  group.scale.setScalar(1.25);
  const wheelsL = flatMesh(5, 36, '#090d16');
  wheelsL.position.set(-17.5, 0, 0);
  const wheelsR = flatMesh(5, 36, '#090d16');
  wheelsR.position.set(17.5, 0, 0);
  const body = flatMesh(32, 56, '#f59e0b');
  body.position.set(0, 0, 0.1);
  const windshield = flatMesh(24, 14, '#0f172a');
  windshield.position.set(0, 7, 0.2);
  group.add(wheelsL, wheelsR, body, windshield);
  return { group, body: body.material };
}

export function RaceScene3D({
  stateRef,
  paused,
  /** Called a few times a second with what the HUD needs — never per frame. */
  onHud,
}: {
  stateRef: React.MutableRefObject<RaceState>;
  paused: boolean;
  onHud: (state: RaceState) => void;
}) {
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const hudAt = useRef(0);

  const kit = useMemo(() => {
    const root = new THREE.Group();

    const backdrop = flatMesh(1, 1, '#064e3b');
    backdrop.position.z = -8;
    root.add(backdrop);

    const asphalt = makeStrip(ROWS, '#ffffff');
    asphalt.mesh.position.z = -6;
    const curbs = makeStrip(ROWS * 2, '#ffffff');
    curbs.mesh.position.z = -5.8;
    const dashes = makeStrip(ROWS * (LANES - 1), '#ffffff', 0.35);
    dashes.mesh.position.z = -5.6;
    root.add(asphalt.mesh, curbs.mesh, dashes.mesh);

    const finishLine = makeStrip(1, '#ffffff', 0.95);
    finishLine.mesh.position.z = -5.4;
    // Everything here is flat and overlapping, so paint order is set by hand
    // rather than left to three's depth sort.
    backdrop.renderOrder = 0;
    asphalt.mesh.renderOrder = 1;
    curbs.mesh.renderOrder = 2;
    dashes.mesh.renderOrder = 3;
    finishLine.mesh.renderOrder = 4;
    root.add(finishLine.mesh);

    const pads = Array.from({ length: 4 }, () => {
      const group = new THREE.Group();
      group.scale.setScalar(1.25);
      const plate = flatMesh(36, 36, '#38bdf8', 0.35);
      const ring = flatMesh(40, 40, '#38bdf8', 0.9);
      ring.position.z = -0.1;
      const bolt = new THREE.Mesh(
        boltShape(),
        new THREE.MeshBasicMaterial({ color: '#facc15', depthWrite: false }),
      );
      bolt.position.z = 0.1;
      group.add(ring, plate, bolt);
      setOrder(group, 5);
      root.add(group);
      return group;
    });

    const cars = Array.from({ length: 8 }, () => {
      const car = buildCar();
      setOrder(car.group, 6);
      root.add(car.group);
      return car;
    });

    const sparkGeometry = new THREE.CircleGeometry(3.5, 10);
    const sparks = Array.from({ length: SPARK_POOL }, () => {
      const mesh = new THREE.Mesh(
        sparkGeometry,
        new THREE.MeshBasicMaterial({ color: '#facc15', depthWrite: false }),
      );
      mesh.position.z = 3;
      mesh.renderOrder = 9;
      mesh.visible = false;
      root.add(mesh);
      return mesh;
    });

    return { root, backdrop, asphalt, curbs, dashes, finishLine, pads, cars, sparks };
  }, []);

  // Bikes are built from the state's colours, so they are rebuilt only when a
  // new race starts with a different line-up.
  const bikes = useMemo(() => {
    const built = stateRef.current.bikers.map((b) => {
      const parts = buildBiker(b);
      setOrder(parts.group, 8);
      kit.root.add(parts.group);
      return parts;
    });
    return built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit, stateRef.current.bikers.length, stateRef.current.mode]);

  useEffect(
    () => () => {
      for (const parts of bikes) kit.root.remove(parts.group);
    },
    [bikes, kit],
  );

  // Added to the scene by hand rather than through <primitive>: the group is
  // built once and mutated, so it never wants to take part in reconciliation.
  // The teardown releases the GL buffers, which a race restart would
  // otherwise leak one set at a time.
  useEffect(() => {
    scene.add(kit.root);
    return () => {
      scene.remove(kit.root);
      kit.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose?.();
      });
    };
  }, [scene, kit]);

  // The simulation is laid out in canvas pixels, so it has to know the size
  // the GL view actually ended up.
  useEffect(() => {
    resizeRace(stateRef.current, size.width, size.height);
    kit.backdrop.scale.set(size.width, size.height, 1);
  }, [size.width, size.height, stateRef, kit]);

  const red = useMemo(() => new THREE.Color('#ef4444'), []);
  const white = useMemo(() => new THREE.Color('#ffffff'), []);
  const asphaltColor = useMemo(() => new THREE.Color('#1e293b'), []);

  useFrame((_, delta) => {
    const state = stateRef.current;
    const cw = state.cw || size.width;
    const ch = state.ch || size.height;
    if (!cw || !ch) return;

    // Frames, not seconds — and capped, so a hitch does not teleport anyone
    // through the traffic they were about to hit.
    const dt = Math.min(3, Math.max(0.0001, delta * 60));
    if (!paused) raceStep(state, dt);

    const leader = cameraLeader(state);
    const roadW = roadWidth(cw);
    const sliceH = ch / ROWS;

    // ── Road ────────────────────────────────────────────────────────────
    for (let r = 0; r < ROWS; r++) {
      const yTopCanvas = r * sliceH;
      const yBottomCanvas = yTopCanvas + sliceH + 1;
      const curve = curveOffsetAtY(state, yTopCanvas);
      const left = (cw - roadW) / 2 + curve;
      const yTop = worldY(ch, yTopCanvas);
      const yBottom = worldY(ch, yBottomCanvas);
      const x0 = worldX(cw, left);
      const x1 = worldX(cw, left + roadW);

      setQuad(kit.asphalt.positions, r, x0, x1, yTop, yBottom, 0);
      setQuadColor(kit.asphalt.colors, r, asphaltColor);

      // Red-and-white kerbs that strobe past as you move.
      const phase = Math.floor((yTopCanvas - state.roadOffset + 4800) / 24) % 2 === 0;
      const kerb = phase ? red : white;
      setQuad(kit.curbs.positions, r * 2, x0 - 8, x0, yTop, yBottom, 0);
      setQuadColor(kit.curbs.colors, r * 2, kerb);
      setQuad(kit.curbs.positions, r * 2 + 1, x1, x1 + 8, yTop, yBottom, 0);
      setQuadColor(kit.curbs.colors, r * 2 + 1, kerb);

      for (let l = 1; l < LANES; l++) {
        const q = r * (LANES - 1) + (l - 1);
        if (!phase) {
          // Collapse the dash to nothing rather than hiding a whole mesh.
          setQuad(kit.dashes.positions, q, 0, 0, 0, 0, 0);
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
          0,
        );
        setQuadColor(kit.dashes.colors, q, white);
      }
    }
    kit.asphalt.geometry.attributes.position.needsUpdate = true;
    kit.asphalt.geometry.attributes.color.needsUpdate = true;
    kit.curbs.geometry.attributes.position.needsUpdate = true;
    kit.curbs.geometry.attributes.color.needsUpdate = true;
    kit.dashes.geometry.attributes.position.needsUpdate = true;
    kit.dashes.geometry.attributes.color.needsUpdate = true;

    // ── Finish line, once it comes into view ────────────────────────────
    const finishY = ch - 115 - (FINISH_DIST - leader.dist) * 0.58;
    if (finishY > -40 && finishY < ch + 40) {
      const curve = curveOffsetAtY(state, finishY);
      const left = (cw - roadW) / 2 + curve;
      setQuad(
        kit.finishLine.positions,
        0,
        worldX(cw, left),
        worldX(cw, left + roadW),
        worldY(ch, finishY - 7),
        worldY(ch, finishY + 7),
        0,
      );
      setQuadColor(kit.finishLine.colors, 0, white);
      kit.finishLine.mesh.visible = true;
    } else {
      kit.finishLine.mesh.visible = false;
    }
    kit.finishLine.geometry.attributes.position.needsUpdate = true;
    kit.finishLine.geometry.attributes.color.needsUpdate = true;

    // ── Nitro pads ──────────────────────────────────────────────────────
    kit.pads.forEach((group, i) => {
      const pad = state.pads[i];
      if (!pad) {
        group.visible = false;
        return;
      }
      group.visible = pad.y > -60 && pad.y < ch + 60;
      group.position.set(
        worldX(cw, laneCenterX(state, pad.lane, pad.y)),
        worldY(ch, pad.y),
        1,
      );
    });

    // ── Traffic ─────────────────────────────────────────────────────────
    kit.cars.forEach((car, i) => {
      const data = state.traffic[i];
      if (!data) {
        car.group.visible = false;
        return;
      }
      car.group.visible = data.y > -90 && data.y < ch + 90;
      car.group.position.set(
        worldX(cw, laneCenterX(state, data.lane, data.y)),
        worldY(ch, data.y),
        1.5,
      );
      car.body.color.set(data.color);
    });

    // ── Bikes ───────────────────────────────────────────────────────────
    state.bikers.forEach((b, i) => {
      const parts = bikes[i];
      if (!parts) return;
      const y = screenYOf(state, b, leader);
      const onScreen = y > -110 && y < ch + 110;
      parts.group.visible = onScreen;
      if (!onScreen) return;

      parts.group.position.set(worldX(cw, b.x), worldY(ch, y), 2);
      // A wipeout spins the whole bike; otherwise it leans into the bend.
      parts.spin.rotation.z = b.wipeoutTimer > 0 ? -b.wipeoutTimer * 0.32 : -b.lean;

      const boosting = b.boostTimer > 0;
      parts.flame.visible = boosting;
      parts.flameCore.visible = boosting;
      if (boosting) {
        parts.flame.scale.y = 0.8 + Math.random() * 0.5;
        parts.flameCore.scale.y = 0.8 + Math.random() * 0.4;
      }

      if (b.attackTimer > 0 && b.attackState) {
        const reach = b.attackState === 'kick' ? 32 : 24;
        parts.strike.visible = true;
        parts.strike.scale.x = reach / 28;
        parts.strike.position.x = b.attackDir > 0 ? 6 + reach / 2 : -6 - reach / 2;
        parts.strike.material.color.set(b.attackState === 'kick' ? '#facc15' : '#ffffff');
      } else {
        parts.strike.visible = false;
      }

      const hp = Math.max(0, Math.min(1, b.hp / 100));
      parts.hpFill.scale.x = hp || 0.001;
      parts.hpFill.position.x = -18 + (36 * hp) / 2;
      (parts.hpFill.material as THREE.MeshBasicMaterial).color.set(
        b.hp > 35 ? '#22c55e' : '#ef4444',
      );
    });

    // ── Sparks ──────────────────────────────────────────────────────────
    kit.sparks.forEach((mesh, i) => {
      const sp = state.sparks[i];
      if (!sp) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(worldX(cw, sp.x), worldY(ch, sp.y), 3);
      (mesh.material as THREE.MeshBasicMaterial).color.set(sp.color);
    });

    // The HUD is React, so it updates on a human timescale, not a GL one.
    hudAt.current += delta;
    if (hudAt.current > 0.12) {
      hudAt.current = 0;
      onHud(state);
    }
  });

  return null;
}
