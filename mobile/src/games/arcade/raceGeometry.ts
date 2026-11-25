/**
 * Track space to screen space.
 *
 * The server knows only lanes and distances; everything about how wide the
 * road looks, where the horizon is and how the highway bends is decided here,
 * on each device, from the room's seed. That is what lets four phones with
 * four different screens race in one world: nothing about the picture is on
 * the wire.
 *
 * `curveAt` is the one function that must stay identical to the server's copy
 * in `backend/src/games/engines/race.engine.ts` — not for correctness of the
 * simulation, which never consults it, but so that every rider sees the same
 * road under their wheels.
 */

export const LANES = 4;
/** Track units to screen pixels, looking up the road. */
export const DIST_TO_PX = 0.58;
/** How far up from the bottom edge the camera's rider sits. */
export const CAM_OFFSET = 115;
const MAX_ROAD_W = 460;
const MAX_BEND_PX = 155;

/** Mirror of the server's road shape — same formula, same seed, same road. */
export function curveAt(seed: number, dist: number): number {
  const s = seed * 0.0137;
  const a = Math.sin(dist / 620 + s);
  const b = Math.sin(dist / 1310 + s * 2.3);
  const c = Math.sin(dist / 2630 + s * 4.1);
  return Math.max(-1, Math.min(1, a * 0.5 + b * 0.33 + c * 0.22));
}

export function roadWidth(cw: number): number {
  return Math.min(cw * 0.92, MAX_ROAD_W);
}

/** Where along the track the given screen row is looking. */
export function distAtY(ch: number, y: number, cameraDist: number): number {
  return cameraDist + (ch - CAM_OFFSET - y) / DIST_TO_PX;
}

export function screenYOf(ch: number, dist: number, cameraDist: number): number {
  return ch - CAM_OFFSET - (dist - cameraDist) * DIST_TO_PX;
}

/**
 * How far the road has slid sideways at this height of the screen.
 *
 * The bend is read at the distance that row of pixels represents, then
 * squared off towards the bottom of the screen — zero under your own wheels,
 * strongest at the horizon. That is what makes a bend arrive rather than the
 * whole road sliding at once.
 */
export function curveOffsetAtY(
  seed: number,
  cw: number,
  ch: number,
  y: number,
  cameraDist: number,
): number {
  const normY = 1 - Math.max(0, Math.min(1, y / ch));
  const bend = curveAt(seed, distAtY(ch, y, cameraDist));
  return bend * normY * normY * Math.min(cw * 0.34, MAX_BEND_PX);
}

export function laneCenterX(
  seed: number,
  cw: number,
  ch: number,
  lane: number,
  y: number,
  cameraDist: number,
): number {
  const roadW = roadWidth(cw);
  const left = (cw - roadW) / 2 + curveOffsetAtY(seed, cw, ch, y, cameraDist);
  const laneW = roadW / LANES;
  return left + laneW * lane + laneW / 2;
}
