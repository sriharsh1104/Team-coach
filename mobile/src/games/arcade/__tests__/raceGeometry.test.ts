import {
  CAM_OFFSET,
  curveAt,
  curveOffsetAtY,
  distAtY,
  laneCenterX,
  roadWidth,
  screenYOf,
} from '../raceGeometry';

/**
 * These same three values are asserted in the server's race.engine.spec.
 * If either copy of `curveAt` is edited, one of the two suites goes red —
 * which is the point, because a road that bends differently per device is
 * four riders racing on four different tracks.
 */
const GOLDEN: [number, number, number][] = [
  [42, 0, 0.747144],
  [42, 5000, -0.14479],
  [7, 1234, 0.90499],
];

describe('raceGeometry', () => {
  it('bends the road exactly the way the server says it does', () => {
    for (const [seed, dist, expected] of GOLDEN) {
      expect(curveAt(seed, dist)).toBeCloseTo(expected, 5);
    }
  });

  it('puts the camera rider near the bottom of the screen', () => {
    expect(screenYOf(800, 1000, 1000)).toBe(800 - CAM_OFFSET);
    // Someone 100 units up the road is drawn higher up the screen.
    expect(screenYOf(800, 1100, 1000)).toBeLessThan(800 - CAM_OFFSET);
  });

  it('maps a screen row back to the distance it is looking at', () => {
    const ch = 800;
    const y = 300;
    const dist = distAtY(ch, y, 5000);
    expect(screenYOf(ch, dist, 5000)).toBeCloseTo(y, 6);
  });

  it('holds the road still under your wheels and bends it at the horizon', () => {
    const cw = 390;
    const ch = 800;
    const atRider = curveOffsetAtY(42, cw, ch, ch, 0);
    const atHorizon = curveOffsetAtY(42, cw, ch, 0, 0);
    expect(Math.abs(atRider)).toBeLessThan(0.001);
    expect(Math.abs(atHorizon)).toBeGreaterThan(20);
  });

  it('spaces four lanes evenly across the road', () => {
    const cw = 390;
    const ch = 800;
    const y = ch;
    const lanes = [0, 1, 2, 3].map((l) => laneCenterX(42, cw, ch, l, y, 0));
    const gaps = [lanes[1] - lanes[0], lanes[2] - lanes[1], lanes[3] - lanes[2]];
    for (const gap of gaps) expect(gap).toBeCloseTo(roadWidth(cw) / 4, 6);
    // And the whole road sits centred on the screen.
    expect((lanes[0] + lanes[3]) / 2).toBeCloseTo(cw / 2, 6);
  });
});
