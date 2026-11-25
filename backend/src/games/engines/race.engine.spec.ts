import {
  FINISH_DIST,
  RaceState,
  bikerOf,
  createRaceState,
  curveAt,
  raceAttack,
  raceForfeit,
  raceLeader,
  raceNitro,
  racePublicState,
  raceStandings,
  raceStep,
  raceSteer,
  raceTick,
} from './race.engine';

/** Deterministic rng so a step plays out the same way every run. */
function seeded(seed = 5): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function race(
  players: string[] = ['a'],
  names: Record<string, string> = {},
): RaceState {
  return createRaceState(players, names, 42);
}

/** Clear the road so a test can assert on one rule at a time. */
function quiet(state: RaceState): RaceState {
  state.traffic = [];
  state.pads = [];
  return state;
}

describe('race.engine', () => {
  it('fills the empty seats with CPU riders and names the humans', () => {
    const solo = race(['a'], { a: 'Riya' });
    expect(solo.bikers).toHaveLength(4);
    expect(solo.bikers[0].userId).toBe('a');
    expect(solo.bikers[0].name).toBe('Riya');
    expect(solo.bikers[0].tag).toBe('P1');
    expect(solo.bikers.slice(1).every((b) => b.userId === null)).toBe(true);
    expect(solo.bikers[1].name).toBe('RAZOR (CPU)');

    const full = race(['a', 'b', 'c', 'd']);
    expect(full.bikers.every((b) => b.userId !== null)).toBe(true);
  });

  it('refuses a line-up that will not fit on the grid', () => {
    expect(() => createRaceState([], {}, 1)).toThrow(/riders/);
    expect(() => createRaceState(['a', 'b', 'c', 'd', 'e'], {}, 1)).toThrow(
      /riders/,
    );
  });

  it('draws the same road on every client from the seed alone', () => {
    // No state, no syncing: distance in, bend out, bounded either way.
    for (const dist of [0, 500, 5123, 18499]) {
      expect(curveAt(42, dist)).toBe(curveAt(42, dist));
      expect(Math.abs(curveAt(42, dist))).toBeLessThanOrEqual(1);
    }
    // A different room bends differently.
    expect(curveAt(42, 5123)).not.toBeCloseTo(curveAt(99, 5123), 3);

    // The client mirrors this function so every rider sees one road. These
    // same three values are asserted in mobile's raceGeometry.test.ts — edit
    // either copy and one of the two suites goes red, which is the point.
    expect(curveAt(42, 0)).toBeCloseTo(0.747144, 5);
    expect(curveAt(42, 5000)).toBeCloseTo(-0.14479, 5);
    expect(curveAt(7, 1234)).toBeCloseTo(0.90499, 5);
  });

  it('steers one lane at a time and stops at the kerbs', () => {
    const state = quiet(race(['a']));
    const me = bikerOf(state, 'a')!;
    expect(me.lane).toBe(0);

    raceSteer(state, 'a', -1);
    expect(me.lane).toBe(0);

    for (let i = 0; i < 5; i++) raceSteer(state, 'a', 1);
    expect(me.lane).toBe(3);
  });

  it('spends nitro, and refuses it when the tank is low or a boost is running', () => {
    const state = quiet(race(['a']));
    const me = bikerOf(state, 'a')!;

    raceNitro(state, 'a');
    expect(me.nitro).toBe(70);
    expect(me.boostTimer).toBeGreaterThan(0);

    raceNitro(state, 'a');
    expect(me.nitro).toBe(70); // already boosting

    me.boostTimer = 0;
    me.nitro = 20;
    raceNitro(state, 'a');
    expect(me.nitro).toBe(20);
  });

  it('kicks a rival off the bike, and punches chip at them instead', () => {
    const kicked = quiet(race(['a']));
    kicked.bikers[1].lane = 1;
    kicked.bikers[1].dist = kicked.bikers[0].dist + 10;
    raceAttack(kicked, 'a', 'kick');
    expect(kicked.bikers[1].wipeoutTimer).toBeGreaterThan(0);

    const punched = quiet(race(['a']));
    punched.bikers[1].lane = 1;
    punched.bikers[1].dist = punched.bikers[0].dist + 10;
    raceAttack(punched, 'a', 'punch');
    expect(punched.bikers[1].hp).toBe(65);
    expect(punched.bikers[1].wipeoutTimer).toBe(0);
    expect(punched.bikers[1].lane).toBe(2); // shoved a lane over
  });

  it('announces a swing even when it misses', () => {
    const state = quiet(race(['a']));
    for (const b of state.bikers.slice(1)) b.dist = 5000;
    raceAttack(state, 'a', 'kick');
    expect(raceTick(state).ev).toEqual([
      { type: 'swing', seat: 0, move: 'kick' },
    ]);
  });

  it('lets a downed rider do nothing at all', () => {
    const state = quiet(race(['a']));
    const me = bikerOf(state, 'a')!;
    me.wipeoutTimer = 40;

    raceSteer(state, 'a', 1);
    expect(me.lane).toBe(0);
    raceNitro(state, 'a');
    expect(me.nitro).toBe(100);
    raceAttack(state, 'a', 'kick');
    expect(me.attackTimer).toBe(0);
  });

  it('wipes a rider out when they run into traffic', () => {
    const state = race(['a']);
    state.pads = [];
    const me = bikerOf(state, 'a')!;
    state.traffic = [{ lane: me.lane, dist: me.dist + 10, speed: 3 }];

    raceStep(state, 1, seeded());
    expect(me.wipeoutTimer).toBeGreaterThan(0);
    expect(raceTick(state).ev.some((e) => e.type === 'crash')).toBe(true);
  });

  it('tops up the tank when a rider takes a nitro pad', () => {
    const state = race(['a']);
    state.traffic = [];
    const me = bikerOf(state, 'a')!;
    me.nitro = 10;
    state.pads = [{ lane: me.lane, dist: me.dist + 10 }];

    raceStep(state, 1, seeded());
    // 50 from the pad, plus the trickle every rider gets each tick.
    expect(me.nitro).toBeCloseTo(60, 0);
    expect(me.boostTimer).toBeGreaterThan(0);
  });

  it('ends the race at the flag and names the winner once', () => {
    const state = quiet(race(['a']));
    state.bikers[0].dist = FINISH_DIST - 1;

    raceStep(state, 1, seeded());
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe('a');
    expect(state.winnerSeat).toBe(0);

    raceStep(state, 50, seeded());
    expect(state.winnerSeat).toBe(0);
  });

  it('freezes the world once the race is over', () => {
    const state = quiet(race(['a']));
    state.phase = 'done';
    const at = state.bikers[0].dist;
    raceStep(state, 10, seeded());
    expect(state.bikers[0].dist).toBe(at);
  });

  it('hands a leaver"s bike to the CPU, and calls it when one human is left', () => {
    const two = quiet(race(['a', 'b']));
    raceForfeit(two, 'b');
    expect(two.bikers[1].userId).toBeNull();
    expect(two.phase).toBe('done');
    expect(two.winnerId).toBe('a');
    expect(two.endReason).toBe('forfeit');

    const three = quiet(race(['a', 'b', 'c']));
    raceForfeit(three, 'c');
    // Two humans still racing — the race carries on.
    expect(three.phase).toBe('play');
  });

  it('orders standings by distance, and by who crossed first', () => {
    const state = quiet(race(['a']));
    state.bikers[2].dist = 900;
    state.bikers[1].dist = 500;
    expect(raceStandings(state).map((b) => b.seat)).toEqual([2, 1, 3, 0]);

    state.bikers[0].finishedAt = 10;
    expect(raceStandings(state)[0].seat).toBe(0);
    expect(raceLeader(state).seat).toBe(2);
  });

  it('packs a tick into bare arrays and drains the events with it', () => {
    const state = quiet(race(['a']));
    bikerOf(state, 'a')!.boostTimer = 10;
    raceNitro(state, 'a');

    const tick = raceTick(state);
    expect(tick.b).toHaveLength(4);
    // [lane, dist, hp, nitro, speed, flags] — six numbers, nothing else.
    expect(tick.b[0]).toHaveLength(6);
    expect(tick.b[0][5] & 1).toBe(1); // boosting
    expect(tick.done).toBe(0);

    // Events are handed over exactly once.
    expect(raceTick(state).ev).toEqual([]);
  });

  it('describes the grid once, for the room view', () => {
    const view = racePublicState(race(['a'], { a: 'Riya' }));
    expect(view.seats).toHaveLength(4);
    expect(view.seats[0]).toMatchObject({ seat: 0, userId: 'a', name: 'Riya' });
    expect(view.seed).toBe(42);
    expect(view.finishDist).toBe(FINISH_DIST);
  });
});
