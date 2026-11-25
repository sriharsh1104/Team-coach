import * as THREE from 'three';

/**
 * Drawing kit for the arcade scene.
 *
 * The scene is flat: one world unit is one screen pixel under an orthographic
 * camera, so every coordinate from the original 2D canvas carries straight
 * over. The only conversion is that canvas y grows downward and world y grows
 * upward.
 */

export function worldX(cw: number, x: number): number {
  return x - cw / 2;
}
export function worldY(ch: number, y: number): number {
  return ch / 2 - y;
}

export type FlatMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

function basic(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
  });
}

/** A plain rectangle, centred on its own origin. */
export function flatMesh(width: number, height: number, color: string, opacity = 1): FlatMesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), basic(color, opacity));
}

/**
 * A rounded rectangle — what the original draws with `roundRect`, and the
 * detail that stops bike chassis and car bodies looking like bare boxes.
 */
export function roundedMesh(
  width: number,
  height: number,
  radius: number,
  color: string,
  opacity = 1,
): FlatMesh {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), basic(color, opacity));
}

export function circleMesh(radius: number, color: string, opacity = 1): FlatMesh {
  return new THREE.Mesh(new THREE.CircleGeometry(radius, 20), basic(color, opacity));
}

/** The lightning bolt stamped on a nitro pad, in place of the ⚡ glyph. */
export function boltMesh(scale: number, color: string): FlatMesh {
  const s = new THREE.Shape();
  s.moveTo(2, 9);
  s.lineTo(-4, 1);
  s.lineTo(0, 1);
  s.lineTo(-2, -9);
  s.lineTo(4, -1);
  s.lineTo(0, -1);
  s.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), basic(color, 1));
  mesh.scale.setScalar(scale);
  return mesh;
}

/**
 * Paint order, pushed down onto every mesh in a subtree.
 *
 * `renderOrder` on a Group does nothing — three sorts the meshes themselves.
 */
export function setOrder(root: THREE.Object3D, order: number): void {
  root.traverse((object) => {
    object.renderOrder = order;
  });
}

/** Releases the GL buffers a subtree holds. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose?.();
  });
}

// ── Dynamic quad strips ────────────────────────────────────────────────────

export type Strip = {
  mesh: FlatMesh;
  positions: Float32Array;
  colors: Float32Array;
  geometry: THREE.BufferGeometry;
};

/** A strip of `rows` quads whose corners are rewritten every frame. */
export function makeStrip(rows: number, opacity = 1): Strip {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(rows * 4 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const colors = new Float32Array(rows * 4 * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const index: number[] = [];
  for (let r = 0; r < rows; r++) {
    const o = r * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: '#ffffff',
      vertexColors: true,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    }),
  );
  return { mesh, positions, colors, geometry };
}

export function setQuad(
  positions: Float32Array,
  quadIndex: number,
  x0: number,
  x1: number,
  yTop: number,
  yBottom: number,
  z = 0,
): void {
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

export function setQuadColor(colors: Float32Array, quadIndex: number, c: THREE.Color): void {
  const o = quadIndex * 12;
  for (let i = 0; i < 4; i++) {
    colors[o + i * 3] = c.r;
    colors[o + i * 3 + 1] = c.g;
    colors[o + i * 3 + 2] = c.b;
  }
}

export function flushStrip(strip: Strip): void {
  strip.geometry.attributes.position.needsUpdate = true;
  strip.geometry.attributes.color.needsUpdate = true;
}

// ── Pixel text ─────────────────────────────────────────────────────────────

/**
 * A 5×7 bitmap font, baked into geometry.
 *
 * GL has no text: drawing a string normally means shipping a font atlas and
 * sampling it. The labels here are a handful of short, fixed, upper-case
 * words, so a tiny bitmap font costs nothing to carry and bakes into one
 * mesh per label — which is also exactly the blocky look an arcade wants.
 */
const GLYPHS: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '11111 00100 00100 00100 00100 00100 11111',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11111 00010 00100 00010 00001 10001 01110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
};

const GLYPH_W = 5;
const GLYPH_H = 7;

/**
 * One mesh for a whole word: every lit pixel becomes a quad, merged into a
 * single geometry centred on its own origin.
 */
export function pixelTextMesh(text: string, pixel: number, color: string): FlatMesh {
  const chars = text.toUpperCase().split('');
  const advance = GLYPH_W + 1;
  const totalW = (chars.length * advance - 1) * pixel;
  const totalH = GLYPH_H * pixel;

  const positions: number[] = [];
  const index: number[] = [];
  let quad = 0;

  chars.forEach((char, ci) => {
    const rows = GLYPHS[char];
    if (!rows) return;
    rows.split(' ').forEach((row, ry) => {
      for (let rx = 0; rx < GLYPH_W; rx++) {
        if (row[rx] !== '1') continue;
        const x0 = ci * advance * pixel + rx * pixel - totalW / 2;
        const x1 = x0 + pixel;
        // Row 0 is the top of the glyph, so it maps to the highest y.
        const y1 = totalH / 2 - ry * pixel;
        const y0 = y1 - pixel;
        positions.push(x0, y1, 0, x1, y1, 0, x1, y0, 0, x0, y0, 0);
        const o = quad * 4;
        index.push(o, o + 1, o + 2, o, o + 2, o + 3);
        quad++;
      }
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return new THREE.Mesh(geometry, basic(color, 1));
}
