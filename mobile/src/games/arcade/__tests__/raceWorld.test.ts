import { RaceTick } from '../../../api/games';
import { RaceWorld } from '../raceWorld';

/** [lane, dist, hp, nitro, speed, flags] */
function rider(lane: number, dist: number, flags = 0): number[] {
  return [lane, dist, 100, 100, 8.8, flags];
}

function tick(over: Partial<RaceTick> = {}): RaceTick {
  return {
    t: 0,
    b: [rider(0, 0), rider(1, 0)],
    c: [[2, 400]],
    p: [[3, 700]],
    ev: [],
    done: 0,
    ...over,
  };
}

describe('RaceWorld', () => {
  it('has nothing to draw until the first tick lands', () => {
    const world = new RaceWorld(0);
    expect(world.sample(1000).empty).toBe(true);
  });

  it('reads a point between the last two ticks', () => {
    const world = new RaceWorld(0);
    world.push(tick({ b: [rider(0, 100), rider(1, 0)] }), 1000);
    world.push(tick({ b: [rider(0, 200), rider(1, 0)] }), 1050);

    // Rendering runs 55ms behind the newest tick, so a read at 1080 is
    // looking at 1025 — halfway through the 1000→1050 span.
    const view = world.sample(1080);
    expect(view.empty).toBe(false);
    expect(view.riders[0].dist).toBeCloseTo(150, 0);
  });

  it('holds the last frame rather than flinging bikes forward when a tick is late', () => {
    const world = new RaceWorld(0);
    world.push(tick({ b: [rider(0, 100), rider(1, 0)] }), 1000);
    world.push(tick({ b: [rider(0, 200), rider(1, 0)] }), 1050);

    // Far past the next tick's due time: clamped to the newest known state.
    expect(world.sample(5000).riders[0].dist).toBe(200);
    // And before the first: clamped the other way.
    expect(world.sample(900).riders[0].dist).toBe(100);
  });

  it('rides the camera with whoever is in front', () => {
    const world = new RaceWorld(0);
    world.push(tick({ b: [rider(0, 100), rider(1, 900)] }), 1000);
    expect(world.sample(1200).cameraDist).toBe(900);
  });

  it('decodes the flag bits into states', () => {
    const world = new RaceWorld(0);
    world.push(tick({ b: [rider(0, 0, 1 | 4), rider(1, 0, 2)] }), 1000);
    const view = world.sample(1200);
    expect(view.riders[0].boosting).toBe(true);
    expect(view.riders[0].attack).toBe('kick');
    expect(view.riders[1].down).toBe(true);
    expect(view.riders[1].boosting).toBe(false);
  });

  it('moves your own lane the moment you press, then defers to the server', () => {
    const world = new RaceWorld(0);
    world.push(tick({ b: [rider(1, 0), rider(1, 0)] }), 1000);

    world.predict('right');
    expect(world.sample(1200).riders[0].lane).toBe(2);
    // The other rider is never predicted for.
    expect(world.sample(1200).riders[1].lane).toBe(1);

    // The next tick is the truth, even if it disagrees.
    world.push(tick({ b: [rider(1, 0), rider(1, 0)] }), 1050);
    expect(world.sample(1250).riders[0].lane).toBe(1);
  });

  it('will not predict past the kerb, or while you are down', () => {
    const world = new RaceWorld(0);
    world.push(tick({ b: [rider(0, 0), rider(1, 0)] }), 1000);
    world.predict('left');
    expect(world.sample(1200).riders[0].lane).toBe(0);

    const downed = new RaceWorld(0);
    downed.push(tick({ b: [rider(1, 0, 2), rider(1, 0)] }), 1000);
    downed.predict('right');
    expect(downed.sample(1200).riders[0].lane).toBe(1);
  });

  it('hands the effect queue over exactly once', () => {
    const world = new RaceWorld(0);
    const events = world.push(
      tick({ ev: [{ type: 'crash', seat: 1 }] }),
      1000,
    );
    expect(events).toHaveLength(1);
    expect(world.takeFx()).toHaveLength(1);
    expect(world.takeFx()).toHaveLength(0);
  });

  it('snaps a recycled car up the road instead of sliding it', () => {
    const world = new RaceWorld(0);
    world.push(tick({ c: [[2, 400]] }), 1000);
    // The server moved this car 900 units: that is a respawn, not a drive.
    world.push(tick({ c: [[1, 1300]] }), 1050);
    const view = world.sample(1075);
    expect(view.cars[0].dist).toBe(1300);
    expect(view.cars[0].lane).toBe(1);
  });

  it('says so when ticks stop arriving', () => {
    const world = new RaceWorld(0);
    world.push(tick(), 1000);
    expect(world.stalled(1200)).toBe(false);
    expect(world.stalled(2000)).toBe(true);
  });

  it('follows a seat change, dropping any prediction with it', () => {
    const world = new RaceWorld(0);
    world.push(tick({ b: [rider(0, 0), rider(2, 0)] }), 1000);
    world.predict('right');
    world.setSeat(1);
    const view = world.sample(1200);
    expect(view.riders[0].lane).toBe(0);
    expect(view.riders[1].lane).toBe(2);
  });
});
